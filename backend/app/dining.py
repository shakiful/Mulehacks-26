"""Today's public UCM menus. Only fixed Sodexo hosts and hall IDs are fetched."""
import html
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Lock
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

from .schemas import DiningHallMenu, DiningMeal, DiningMenus, DiningStation

CAMPUS_TIMEZONE = 'America/Chicago'
SITE = 'https://ucmo.sodexomyway.com'
MENU_API = 'https://api-prd.sodexomyway.net/v0.2/data/menu'
MAX_RESPONSE_BYTES = 2_000_000


@dataclass(frozen=True)
class Hall:
    id: str
    name: str
    location_id: str
    menu_id: str
    source_url: str


HALLS = (
    Hall('todd', 'Todd Dining Center', '10420009', '1410786',
         SITE + '/en-us/locations/todd-dining-center-in-todd-hall'),
    Hall('ellis', 'Ellis Dining Center', '10420003', '1410907',
         SITE + '/en-us/locations/ellis-dining-center'),
)


class DiningUnavailable(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class SodexoMenus:
    """Read the same public feed used by the official dining website.

    Its public browser header is discovered at runtime, kept only in memory,
    and never included in our API or committed as a credential.
    """
    def __init__(self, *, opener=None, monotonic_clock=time.monotonic):
        self.opener = opener or build_opener(NoRedirect()).open
        self.monotonic_clock = monotonic_clock
        self._header = None
        self._header_expires = 0
        self._lock = Lock()

    def _read(self, url, headers=None):
        with self.opener(Request(url, headers=headers or {'Accept': 'text/html'}), timeout=8) as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise DiningUnavailable('Dining response is too large.')
        return raw.decode('utf-8')

    def _browser_header(self):
        with self._lock:
            if self._header and self.monotonic_clock() < self._header_expires:
                return self._header
            page = self._read(SITE + '/en-us/')
            script = re.search(r'<script\b[^>]*\bsrc=["\'](/static/js/main\.[a-f0-9]+\.js)["\']', page)
            if not script:
                raise DiningUnavailable('Dining website configuration is unavailable.')
            bundle = self._read(SITE + script[1])
            header = re.search(
                r'API_URL:\s*"https://api-prd\.sodexomyway\.net/v0\.2/",\s*API_KEY:\s*"([a-f0-9-]{36})"',
                bundle,
            )
            if not header:
                raise DiningUnavailable('Dining website configuration is unavailable.')
            self._header = header[1]
            self._header_expires = self.monotonic_clock() + 3600
            return self._header

    def fetch(self, hall, day):
        try:
            raw = self._read(
                f'{MENU_API}/{hall.location_id}/{hall.menu_id}?date={day.isoformat()}',
                {'Accept': 'application/json', 'API-Key': self._browser_header()},
            )
            return json.loads(raw)
        except HTTPError as exc:
            if exc.code == 401:
                with self._lock:
                    self._header = None
            raise DiningUnavailable('The official dining menu is unavailable.') from None
        except Exception:
            raise DiningUnavailable('The official dining menu is unavailable.') from None


def _label(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 400:
        raise DiningUnavailable('Invalid menu item.')
    return ' '.join(html.unescape(value).split())


def normalize_menu(data):
    if data is None:
        return []  # Sodexo also uses null when no menu is published.
    if not isinstance(data, list) or len(data) > 12:
        raise DiningUnavailable('Invalid menu.')
    meals = []
    for meal in data:
        name = _label(meal['name'])
        groups = meal['groups']
        if not isinstance(groups, list) or len(groups) > 80:
            raise DiningUnavailable('Invalid menu stations.')
        stations = []
        for group in groups:
            station_name = _label(group['name'])
            items = group['items']
            if not isinstance(items, list) or len(items) > 500:
                raise DiningUnavailable('Invalid menu items.')
            names = list(dict.fromkeys(_label(item['formalName']) for item in items))
            if names:
                stations.append(DiningStation(name=station_name, items=names))
        if stations:
            meals.append(DiningMeal(name=name, stations=stations))
    return meals


class DiningService:
    def __init__(self, provider=None, *, clock=None, monotonic_clock=time.monotonic):
        self.provider = provider or SodexoMenus()
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.monotonic_clock = monotonic_clock
        self._cache = None
        self._expires = 0
        self._lock = Lock()

    def _hall_menu(self, hall, day):
        try:
            meals = normalize_menu(self.provider.fetch(hall, day))
            status = 'AVAILABLE' if meals else 'EMPTY'
            message = None if meals else 'Sodexo has not published a menu for this day.'
        except Exception:
            meals, status = [], 'UNAVAILABLE'
            message = 'This menu could not be loaded. Try again or open the official Sodexo menu.'
        return DiningHallMenu(id=hall.id, name=hall.name, source_url=hall.source_url,
                              status=status, message=message, meals=meals)

    def today(self):
        now = self.clock()
        day = now.astimezone(ZoneInfo(CAMPUS_TIMEZONE)).date()
        with self._lock:
            if self._cache and self._cache.date == day and self.monotonic_clock() < self._expires:
                return self._cache.model_copy(deep=True)
            with ThreadPoolExecutor(max_workers=2) as workers:
                halls = list(workers.map(lambda hall: self._hall_menu(hall, day), HALLS))
            result = DiningMenus(date=day, timezone=CAMPUS_TIMEZONE, fetched_at=now, halls=halls)
            if all(hall.status != 'UNAVAILABLE' for hall in halls):
                self._cache = result.model_copy(deep=True)
                self._expires = self.monotonic_clock() + 300
            return result
