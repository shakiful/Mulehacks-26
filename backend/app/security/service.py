"""Validated Gemini-first assessment with a labeled offline fallback."""
from typing import Protocol

from ..errors import APIError
from ..schemas import SecurityInput, SecurityResult
from .signals import DESCRIPTIONS, WEIGHTS, detect_signals

LIMITATIONS = ('Text-based risk assessment only; no link was visited, no sender or domain ownership '
               'was verified, and safety is not guaranteed. LOW means fewer detected signals, not safe. '
               'ConnectHub does not save this analysis or submitted text.')
SUMMARIES = {
    'LOW': 'Fewer warning signs were detected in the supplied text; this does not establish safety.',
    'MEDIUM': 'The supplied text contains warning signs that need independent verification.',
    'HIGH': 'The supplied text has strong warning signs consistent with phishing or social engineering.',
}
RECOMMENDATION = ('Verify the request through a known official website or contact channel, rather than '
                  'a link or contact detail in the message. Do not share passwords or verification codes. '
                  'For concerning messages, avoid replying, entering credentials, sending money or opening attachments; '
                  'ask your university IT team for help through its known contact channel.')


def build_result(risk, codes, mode, *, fallback=False):
    limitations = LIMITATIONS
    if fallback:
        limitations += ' Gemini is unavailable; a rule-based fallback was used.'
    return SecurityResult(risk_level=risk, summary=SUMMARIES[risk],
        reasons=[{'code': code, 'description': DESCRIPTIONS[code]} for code in dict.fromkeys(codes)],
        recommendation=RECOMMENDATION, limitations=limitations, analysis_mode=mode)


class SecurityProvider(Protocol):
    def analyze(self, request: SecurityInput) -> SecurityResult: ...


class HeuristicSecurityProvider:
    def analyze(self, request):
        signals = detect_signals(request.text)
        score = sum(WEIGHTS[code] for code in signals)
        risk = 'HIGH' if score >= 3 else 'MEDIUM' if score else 'LOW'
        return build_result(risk, signals, 'HEURISTIC')


class SecurityService:
    def __init__(self, settings, provider: SecurityProvider | None = None):
        self.settings = settings
        self.provider = provider
        if provider is None and settings.ai_provider == 'gemini':
            from .gemini import GeminiSecurityProvider
            self.provider = GeminiSecurityProvider(settings)

    def analyze(self, request: SecurityInput) -> SecurityResult:
        if self.settings.ai_provider == 'heuristic' and self.provider is None:
            return HeuristicSecurityProvider().analyze(request)
        try:
            if self.provider is None:
                raise RuntimeError('No security provider configured')
            result = SecurityResult.model_validate(self.provider.analyze(request))
            # Providers never control recommendations, limitations or arbitrary response text.
            codes = [reason.code for reason in result.reasons]
            if any(code not in DESCRIPTIONS for code in codes) or (result.risk_level != 'LOW' and not codes):
                raise ValueError('Unsupported security evidence')
            return build_result(result.risk_level, codes, result.analysis_mode)
        except Exception:
            if not self.settings.ai_fallback_enabled:
                raise APIError(503, 'PROVIDER_UNAVAILABLE', 'Security analysis provider is unavailable.') from None
            result = HeuristicSecurityProvider().analyze(request)
            return build_result(result.risk_level, [reason.code for reason in result.reasons], 'HEURISTIC', fallback=True)
