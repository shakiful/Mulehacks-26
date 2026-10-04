"""Recognize explicit clock evidence without guessing a time for 'tonight'."""
import re

CLOCK_WORDS = {'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5', 'six': '6',
               'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10', 'eleven': '11', 'twelve': '12'}
WORD_PATTERN = '|'.join(CLOCK_WORDS)
CLOCK_RANGE = re.compile(r'(?<![\d-])\b(\d{1,2})(?::\d{2})?\s*(?:am|pm)?\s*(?:to|until|through|and|[-–])\s*'
                         r'(\d{1,2})(?::\d{2})?\s*(?:am|pm)?\b(?![-\d])', re.I)


def normalize_clock_words(text: str) -> str:
    # Restrict replacements to clock cues, so 'two seats' and course names stay intact.
    text = re.sub(r'\b((?:at|around|about|from|until|between|past|to)\s+)(' + WORD_PATTERN + r')\b',
                  lambda match: match[1] + CLOCK_WORDS[match[2].lower()], text, flags=re.I)
    text = re.sub(r'\b(' + WORD_PATTERN + r')(?=\s*(?:am|pm|tonight|o.clock)\b)',
                  lambda match: CLOCK_WORDS[match[1].lower()], text, flags=re.I)
    text = re.sub(r'\b(half|quarter)\s+(past|to)\s+(\d{1,2})\b',
                  lambda match: f"{(int(match[3]) - 1) % 12 or 12}:45" if match[2].lower() == 'to'
                  else f"{match[3]}:{'30' if match[1].lower() == 'half' else '15'}", text, flags=re.I)
    return text


def has_clock(text: str) -> bool:
    text = normalize_clock_words(text)
    return bool(re.search(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|'
                         r'\b(?:at|around|about|from|between)\s+\d{1,2}\b|\b\d{1,2}\s+tonight\b|'
                         r'\b(noon|midnight)\b', text, re.I))


def has_clock_range(text: str) -> bool:
    text = normalize_clock_words(text)
    return bool(CLOCK_RANGE.search(text))


def range_needs_meridiem(text: str) -> bool:
    text = normalize_clock_words(text)
    ranges = CLOCK_RANGE.findall(text)
    return bool(ranges) and not re.search(r'(?<![a-z])(?:am|pm)\b|\b(morning|afternoon|evening|tonight)\b', text, re.I) \
        and all(int(hour) <= 12 for pair in ranges for hour in pair)
