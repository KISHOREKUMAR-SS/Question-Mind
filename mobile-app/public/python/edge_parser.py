import re
from typing import List, Dict

class SyllabusParser:
    """Parse syllabus from pre-extracted text - extracts content, skips self-study"""
    
    def parse_text(self, text: str) -> List[Dict]:
        """Parse raw text and extract units/topics using original regex logic"""
        return self._extract_modules_regex(text)
    
    def _extract_modules_regex(self, text: str) -> List[Dict]:
        """
        Extract modules using regex - handles table-based syllabi
        Skips 'Guided Self-Study Topics' sections
        """
        units = []
        
        # Clean up the text - normalize whitespace 
        text = self._normalize_text(text)
        
        # Regex to find Module/Unit headers
        # Matches "Module I", "UNIT 1", "Module - 1", "UNIT-III" etc.
        module_header_pattern = r'^[|:\s]*(?:Module|Unit|UNIT|MODULE)\s*[\-]?\s*([IVX]+|\d+)\s*[:\|\-\.]?\s*(.*?)(?:\s*(?:\d+\+\d+|\d+)\s*(?:hours?|hrs?))?$'
        
        lines = text.split('\n')
        
        current_unit = None
        current_content_lines = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check for Module Header
            if "TEXT BOOK" in line.upper() or "REFERENCE" in line.upper():
                 pass

            match = re.search(module_header_pattern, line, re.IGNORECASE)
            is_header = match and len(line) < 120
            
            if is_header:
                # Save previous unit
                if current_unit:
                    content_text = "\n".join(current_content_lines)
                    topics = self._extract_topics_from_content(content_text)
                    if topics:  # Only add if we found topics
                        units.append({
                            "unitNumber": current_unit["number"],
                            "title": current_unit["title"],
                            "topics": topics
                        })
                
                # Start new unit
                unit_num_str = match.group(1)
                raw_title = match.group(2).strip()
                
                # Clean title
                title = re.sub(r'^[:\|\-\.]+|[:\|\-\.]+$', '', raw_title).strip()
                title = re.sub(r'\d+\s*(?:Hours|Hrs).*$', '', title, flags=re.IGNORECASE).strip()
                title = title.replace('|', '').strip()
                title = re.sub(r'\s+\d+$', '', title).strip()

                if not title:
                     title = f"Unit {unit_num_str}"
                
                current_unit = {
                    "number": self._roman_to_int(unit_num_str),
                    "title": title
                }
                current_content_lines = []
            else:
                # Append to current unit content
                if current_unit is not None:
                    current_content_lines.append(line)
        
        # Save last unit
        if current_unit:
            content_text = "\n".join(current_content_lines)
            topics = self._extract_topics_from_content(content_text)
            if topics:
                units.append({
                    "unitNumber": current_unit["number"],
                    "title": current_unit["title"],
                    "topics": topics
                })
        
        return units
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text - fix line breaks and whitespace"""
        text = re.sub(r'[ \t]+', ' ', text)
        lines = text.split('\n')
        return '\n'.join([line.strip() for line in lines if line.strip()])
    
    def _extract_topics_from_content(self, content: str) -> List[str]:
        """Extract topics from module content, explicitly removing Guided Self-Study"""
        clean_lines = []
        skip = False
        
        for line in content.split('\n'):
            line_lower = line.lower()
            if any(x in line_lower for x in ['guided self', 'self-study', 'self study', 'text book', 'reference book', 'course outcome']):
                skip = True
                continue
            
            if skip:
                 continue

            clean_lines.append(line)
            
        content = "\n".join(clean_lines)
        topics = []
        lines = re.split(r'[\n|]', content)
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            line = re.sub(r'^[•\-\*►▪]\s*', '', line)
            line = re.sub(r'^\d+\.\s+', '', line)
            
            if '; ' in line:
                sub_parts = line.split('; ')
                for sp in sub_parts:
                    sp = sp.strip()
                    if sp:
                        sentences = re.split(r'\.\s+(?=[A-Z])', sp)
                        for sent in sentences:
                            cleaned = self._clean_topic(sent)
                            if self._is_valid_topic(cleaned):
                                topics.append(cleaned)
            elif ', ' in line and len(line) > 50:
                sub_parts = line.split(', ')
                for sp in sub_parts:
                    cleaned = self._clean_topic(sp)
                    if self._is_valid_topic(cleaned):
                        topics.append(cleaned)
            else:
                cleaned = self._clean_topic(line)
                if self._is_valid_topic(cleaned):
                    topics.append(cleaned)
                    
        return topics
    
    def _is_valid_topic(self, topic: str) -> bool:
        """Check if topic is valid content"""
        if not topic or len(topic) < 3: return False
        topic_lower = topic.lower()
        
        single_word_skips = ['and', 'or', 'the', 'of', 'in', 'to', 'for', 'with', 'from', 'by', 'at', 'on']
        if topic_lower in single_word_skips:
            return False
        
        if len(topic) < 4 and ' ' not in topic:
            if topic.isupper():
                return True
            elif any(c.isdigit() for c in topic):
                return True
            else:
                return False
        
        skip_phrases = [
            'total hours', 'periods', 'semester', 'category', 'credit', 
            'version', 'lecture', 'tutorial', 'practical', 'exam',
            'course code', 'course title'
        ]
        
        if any(phrase in topic_lower for phrase in skip_phrases): 
            return False
        
        if re.match(r'^[\d\s\W]+$', topic): return False
        if re.match(r'^\d+\s*(?:hrs?|hours?)$', topic_lower): return False
        
        return True
    
    def _clean_topic(self, text: str) -> str:
        """Clean up a topic string"""
        text = re.sub(r'\(\s*\d+\s*(?:hrs?|hours?)?\s*\)', '', text, flags=re.IGNORECASE)
        text = re.sub(r'^\d+[\.\)\-]\s*', '', text)
        text = re.sub(r'^[\W_]+', '', text)
        text = re.sub(r'\s*\d{1,3}(?:-\d{1,3})?$', '', text)
        return text.strip()

    def _roman_to_int(self, s: str) -> int:
        """Convert Roman numeral or digit string to integer"""
        s = s.strip().upper()
        if s.isdigit(): return int(s)
        roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10}
        return roman_map.get(s, 1)

syllabus_parser = SyllabusParser()
