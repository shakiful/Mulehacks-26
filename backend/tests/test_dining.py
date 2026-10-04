import io
import json
from datetime import datetime, timezone
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from backend.app.dining import (
    HALLS, MAX_RESPONSE_BYTES, MENU_API, SITE,
    DiningService, DiningUnavailable, NoRedirect, SodexoMenus,
)
from backend.app.main import create_app


def menu(name='Example bowl'):
    return [{'name': 'Brunch', 'groups': [
        {'name': 'Demo station', 'items': [{'formalName': name}, {'formalName': name}]},
        {'name': 'Empty station', 'items': []},
    ]}]


class Provider:
    def __init__(self):
        self.calls = []
        self.failure = None
        self.data = menu()

    def fetch(self, hall, day):
        self.calls.append((hall.id, day.isoformat()))
        if hall.id == self.failure:
            raise RuntimeError('Upstream error containing private configuration')
        return self.data


def service(provider=None, instant='2026-10-04T15:00:00+00:00', **kwargs):
    return DiningService(provider or Provider(), clock=lambda: datetime.fromisoformat(instant), **kwargs)


def test_public_route_shape_cache_headers_and_no_database_access(settings):
    provider = Provider()
    app = create_app(settings, dining_provider=provider)
    app.state.dining = service(provider)
    with TestClient(app) as client:
        app.state.session_factory = Mock(side_effect=AssertionError('No database needed'))
        response = client.get('/api/dining/menus')
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'no-store'
        body = response.json()
        assert set(body) == {'date', 'timezone', 'fetched_at', 'halls'}
        assert body['date'] == '2026-10-04'
        assert body['timezone'] == 'America/Chicago'
        assert [hall['id'] for hall in body['halls']] == ['todd', 'ellis']
        for hall, expected in zip(body['halls'], HALLS):
            assert set(hall) == {'id', 'name', 'source_url', 'status', 'message', 'meals'}
            assert hall['source_url'] == expected.source_url
            assert hall['status'] == 'AVAILABLE'
            assert hall['message'] is None
            assert hall['meals'] == [{'name': 'Brunch', 'stations': [{'name': 'Demo station', 'items': ['Example bowl']}]}]
        app.state.session_factory.assert_not_called()


@pytest.mark.parametrize(('instant', 'expected'), [
    ('2026-10-04T04:59:00+00:00', '2026-10-03'),
    ('2026-10-04T05:00:00+00:00', '2026-10-04'),
    ('2026-01-04T05:59:00+00:00', '2026-01-03'),
    ('2026-01-04T06:00:00+00:00', '2026-01-04'),
])
def test_campus_date_uses_central_time_including_dst(instant, expected):
    provider = Provider()
    result = service(provider, instant).today()
    assert result.date.isoformat() == expected
    assert all(day == expected for _, day in provider.calls)


def test_cache_expires_and_never_reuses_yesterday_at_midnight():
    provider = Provider()
    elapsed = [0]
    dining = service(provider, '2026-10-04T04:59:00+00:00', monotonic_clock=lambda: elapsed[0])
    first = dining.today()
    first.halls[0].meals.clear()
    assert dining.today().halls[0].meals  # A caller cannot corrupt the cache.
    assert len(provider.calls) == 2
    elapsed[0] = 300
    dining.today()
    assert len(provider.calls) == 4
    dining.clock = lambda: datetime(2026, 10, 4, 5, 0, tzinfo=timezone.utc)
    assert dining.today().date.isoformat() == '2026-10-04'
    assert len(provider.calls) == 6


def test_partial_failure_keeps_other_hall_and_retries_without_error_contents():
    provider = Provider()
    provider.failure = 'ellis'
    dining = service(provider)
    result = dining.today()
    assert [hall.status for hall in result.halls] == ['AVAILABLE', 'UNAVAILABLE']
    assert result.halls[1].meals == []
    assert 'private configuration' not in result.model_dump_json()
    provider.failure = None
    assert all(hall.status == 'AVAILABLE' for hall in dining.today().halls)
    assert len(provider.calls) == 4


def test_expired_cache_does_not_present_old_food_as_available():
    provider = Provider()
    elapsed = [0]
    dining = service(provider, monotonic_clock=lambda: elapsed[0])
    dining.today()
    elapsed[0] = 301
    provider.failure = 'todd'
    result = dining.today()
    assert result.halls[0].status == 'UNAVAILABLE'
    assert result.halls[0].meals == []


@pytest.mark.parametrize('data', [None, [], [{'name': 'Dinner', 'groups': []}]])
def test_missing_published_menu_is_empty_not_closed_or_fake(data):
    provider = Provider()
    provider.data = data
    result = service(provider).today()
    assert all(hall.status == 'EMPTY' and not hall.meals for hall in result.halls)


@pytest.mark.parametrize('data', [
    {'error': 'bad response'},
    [{'name': 'Lunch', 'groups': 'invalid'}],
    [{'name': 'Lunch', 'groups': [{'name': 'Demo station', 'items': [{'formalName': ''}]}]}],
    [{'name': 'Lunch', 'groups': [{'name': 'Demo station', 'items': [{'formalName': {'bad': 'value'}}]}]}],
])
def test_malformed_menu_is_unavailable(data):
    provider = Provider()
    provider.data = data
    assert all(hall.status == 'UNAVAILABLE' for hall in service(provider).today().halls)


def browser_opener(api_payload=None):
    calls = []
    # A synthetic website header, never a real credential.
    header = '00000000-0000-0000-0000-000000000000'
    def open_request(request, timeout):
        assert timeout == 8
        calls.append(request)
        if request.full_url == SITE + '/en-us/':
            return io.BytesIO(b'<script async src="/static/js/main.123abc.js"></script>')
        if request.full_url == SITE + '/static/js/main.123abc.js':
            return io.BytesIO(('API_URL:"https://api-prd.sodexomyway.net/v0.2/",API_KEY:"' + header + '"').encode())
        assert request.full_url.startswith(MENU_API + '/')
        assert request.get_header('Api-key') == header
        return io.BytesIO(json.dumps(api_payload or menu()).encode())
    return open_request, calls


def test_transport_fetches_fixed_halls_and_date_reuses_browser_configuration():
    opener, calls = browser_opener()
    provider = SodexoMenus(opener=opener)
    day = datetime(2026, 10, 4).date()
    assert provider.fetch(HALLS[0], day) == menu()
    provider.fetch(HALLS[1], day)
    assert [request.full_url for request in calls] == [
        SITE + '/en-us/', SITE + '/static/js/main.123abc.js',
        MENU_API + '/10420009/1410786?date=2026-10-04',
        MENU_API + '/10420003/1410907?date=2026-10-04',
    ]


def test_transport_rejects_redirects_oversized_and_external_script_responses():
    assert NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.invalid') is None
    oversized = SodexoMenus(opener=lambda *args, **kwargs: io.BytesIO(b'x' * (MAX_RESPONSE_BYTES + 1)))
    external = SodexoMenus(opener=lambda *args, **kwargs: io.BytesIO(b'<script src="https://other.invalid/main.123abc.js"></script>'))
    for provider in (oversized, external):
        with pytest.raises(DiningUnavailable, match='official dining menu is unavailable'):
            provider.fetch(HALLS[0], datetime(2026, 10, 4).date())
