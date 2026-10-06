import json

def safe_json_load(value, default=None):
    """
    Safely load a JSON/dict/list field.
    Handles raw strings (commonly returned by SQLite) by calling json.loads,
    and returns a standard dictionary or list fallback.
    """
    if value is None:
        return default if default is not None else {}
    
    if isinstance(value, str):
        # Strip simple whitespace
        val_str = value.strip()
        if not val_str:
            return default if default is not None else {}
        try:
            return json.loads(val_str)
        except Exception:
            return default if default is not None else {}
            
    return value
