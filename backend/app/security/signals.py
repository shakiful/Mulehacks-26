"""Conservative text and URL-structure observations, never domain verification."""
import ipaddress
import re
import unicodedata
from urllib.parse import urlsplit

DESCRIPTIONS = {
    'URGENCY': 'Pressures immediate action or threatens an account deadline.',
    'CREDENTIAL_REQUEST': 'Requests a password, verification code or other sensitive information.',
    'LOGIN_LURE': 'Includes a login or account-verification link whose destination has not been verified.',
    'PAYMENT_REQUEST': 'Requests a money transfer, gift card or cryptocurrency payment.',
    'REWARD_LURE': 'Uses a prize or reward claim to encourage a response.',
    'URL_OBFUSCATION': 'A link includes user-info before the actual host, which can disguise its destination.',
    'IP_HOST': 'A link uses a numeric IP address instead of a named domain; ownership is unknown.',
    'INTERNATIONALIZED_DOMAIN': 'A link contains Unicode or punycode domain characters; inspect the actual destination carefully.',
    'INSECURE_LINK': 'A link uses HTTP without transport encryption; this alone does not prove phishing.',
    'SCRIPT_LINK': 'Contains a script or data URL scheme; it was treated as text and not executed.',
}
WEIGHTS = {'URGENCY': 1, 'CREDENTIAL_REQUEST': 3, 'LOGIN_LURE': 2, 'PAYMENT_REQUEST': 2,
           'REWARD_LURE': 1, 'URL_OBFUSCATION': 2, 'IP_HOST': 1,
           'INTERNATIONALIZED_DOMAIN': 1, 'INSECURE_LINK': 1, 'SCRIPT_LINK': 2}
URL_PATTERN = re.compile(r'\b(?:https?://|hxxps?://|www\.)[^\s<>\'"\u200b]+', re.I)
BARE_DOMAIN = re.compile(r'(?<![\w@.-])(?:[a-z0-9-]+\.)+[a-z]{2,63}\b(?:/[^\s<>\'"\u200b]*)?', re.I)


def normalized(text: str) -> str:
    text = unicodedata.normalize('NFKC', text)
    return ' '.join(''.join(char for char in text if unicodedata.category(char) != 'Cf').casefold().split())


def detect_signals(text: str) -> dict[str, str]:
    """Return a bounded evidence snippet for each detected signal."""
    lower = normalized(text)
    signals = {}

    def find(code, pattern, *, check_negation=False):
        for match in re.finditer(pattern, lower):
            prefix = lower[max(0, match.start() - 24):match.start()]
            if check_negation and re.search(r"(?:do not|don't|never|not to|no need to)\s+(?:\w+\s+){0,2}$", prefix):
                continue
            signals[code] = match[0][:160]
            break

    find('URGENCY', r'\b(?:urgent(?:ly)?|immediately|act now|within \d+ (?:minutes|hours)|'
         r'account.{0,40}(?:expir\w*|suspend\w*|lock\w*).{0,24}(?:today|now))\b')
    find('CREDENTIAL_REQUEST', r'\b(?:enter|send|reply with|share|provide|confirm|verify|update)\s+'
         r'(?:\w+\s+){0,6}(?:passwords?|credentials?|(?:verification|authentication|security|login) codes?|otps?|one.time codes?|'
         r'bank account (?:details|number)|social security number)\b', check_negation=True)
    find('PAYMENT_REQUEST', r'\b(?:send|pay|purchase|buy|transfer|wire)\s+(?:\w+\s+){0,5}'
         r'(?:money|funds|gift cards?|bitcoin|crypto(?:currency)?)\b', check_negation=True)
    find('REWARD_LURE', r'\b(?:you(?: have|\x27ve)? won|claim (?:your|a) (?:prize|reward)|free gift)\b')
    find('SCRIPT_LINK', r'\b(?:javascript|data):')
    urls = list(URL_PATTERN.finditer(text))
    if not urls:
        urls = list(BARE_DOMAIN.finditer(text))
    for match in urls:
        raw = match[0].rstrip('.,;:!?)}')
        value = re.sub(r'^hxxp', 'http', raw, flags=re.I)
        if not re.match(r'^https?://', value, re.I):
            value = 'https://' + value
        try:
            parsed = urlsplit(value)
            host = parsed.hostname or ''
            if not host:
                continue
            if parsed.username is not None:
                signals.setdefault('URL_OBFUSCATION', raw[:160])
            if parsed.scheme.casefold() == 'http':
                signals.setdefault('INSECURE_LINK', raw[:160])
            if not host.isascii() or any(label.startswith('xn--') for label in host.casefold().split('.')):
                signals.setdefault('INTERNATIONALIZED_DOMAIN', raw[:160])
            try:
                ipaddress.ip_address(host)
                signals.setdefault('IP_HOST', raw[:160])
            except ValueError:
                pass
            if re.search(r'\b(?:log[ -]?in|sign[ -]?in|verify|verification|password|account)\b', lower) or re.search(
                    r'(?:login|signin|verify)', host + parsed.path, re.I):
                signals.setdefault('LOGIN_LURE', raw[:160])
        except ValueError:
            # Malformed URL structure is not evidence of domain ownership or maliciousness.
            continue
    return signals
