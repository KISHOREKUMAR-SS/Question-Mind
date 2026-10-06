# ⚠️ BACKEND-PYTHON DEPRECATED

**THIS FOLDER IS FOR REFERENCE ONLY**

---

## 🚨 Important Notice

This Python backend folder is **NOT USED** in the production application.

**Do NOT:**
- ❌ Try to run this server
- ❌ Install these dependencies
- ❌ Set up a database for this
- ❌ Deploy this to any server
- ❌ Make changes expecting them to affect the mobile app

**Do:**
- ✅ Keep it for historical reference
- ✅ View it to understand original architecture
- ✅ Check migration comments

---

## 📂 What's Here

### API Routes (NOT USED)
- `routers/auth.py` - Legacy authentication
- `routers/subjects.py` - Legacy subject management
- `routers/syllabus.py` - Legacy syllabus upload
- `routers/question_bank.py` - Legacy question generation
- `routers/staff.py` - Legacy staff management

### Services (MOSTLY DEPRECATED)
- `services/ai_service.py` - ❌ Replaced by `mobile-app/src/lib/aiService.ts`
- `services/auth.py` - ❌ Replaced by localStorage-based auth
- `services/cdap_parser.py` - ❌ Replaced by `mobile-app/src/lib/parsers/cdapParser.ts`
- `services/excel_service.py` - ❌ Replaced by `mobile-app/src/lib/excelGenerator.ts`
- `services/syllabus_parser.py` - ❌ Replaced by `mobile-app/src/lib/parsers/syllabusParser.ts`

### Models (NOT USED)
- `models/` - All legacy database models
- NOT used in standalone app

### Database (NOT USED)
- `database.py` - SQLAlchemy ORM initialization
- NOT executed anywhere

### Configuration (NOT USED)
- `config.py` - Hardcoded localhost URLs
- `.env.example` - Database credentials
- NOT loaded by app

---

## 🎯 Where Everything Went

### Backend → Frontend/Mobile Migration

| Original (Python) | New (TypeScript) | Location |
|---|---|---|
| `services/ai_service.py` | `aiService.ts` | `mobile-app/src/lib/` |
| `services/cdap_parser.py` | `cdapParser.ts` | `mobile-app/src/lib/parsers/` |
| `services/syllabus_parser.py` | `syllabusParser.ts` | `mobile-app/src/lib/parsers/` |
| `services/excel_service.py` | `excelGenerator.ts` | `mobile-app/src/lib/` |
| `routers/auth.py` | `useAuthStore()` | `mobile-app/src/lib/store.ts` |
| All APIs | `src/lib/api.ts` | `mobile-app/src/lib/` |
| Database | IndexedDB + localStorage | Browser storage |

---

## 📝 If You Need to Reference Something

1. **Question Generation Logic**
   - File: `services/ai_service.py` → Lines 150-200
   - Migrated to: `mobile-app/src/lib/aiService.ts` → Lines 400-500

2. **Syllabus Parsing Algorithm**
   - File: `services/syllabus_parser.py`
   - Migrated to: `mobile-app/src/lib/parsers/syllabusParser.ts`

3. **CDAP Parsing Algorithm**
   - File: `services/cdap_parser.py`
   - Migrated to: `mobile-app/src/lib/parsers/cdapParser.ts`

4. **Authentication Flow**
   - File: `routers/auth.py`
   - Migrated to: `mobile-app/src/lib/store.ts` + localStorage

---

## 🗑️ Safe to Delete?

**Recommendation**: Keep this folder for now because:
- ✅ Contains implementation reference
- ✅ Helps understand migration path
- ✅ Useful if reverting needs documentation
- ✅ Good for team knowledge

**Can delete after**:
- [ ] 1 year of successful standalone deployment
- [ ] All team members understand the new architecture
- [ ] All migration documentation is complete

---

## ⚡ Quick Migration Summary

**Before** (Architecture):
```
Phone → Web Server (FastAPI) → Database → LLM APIs
```

**After** (Standalone):
```
Phone → IndexedDB (local) → LLM APIs (direct)
       └─ All logic in browser (TypeScript)
```

**Result**:
- ✅ No server needed
- ✅ No database needed
- ✅ Faster (no network hops)
- ✅ Works offline
- ✅ More scalable
- ✅ Cheaper deployment

---

**Status**: DEPRECATED (Reference Only) ⚠️  
**Action Required**: None  
**Recommendation**: Keep for historical reference  
**Delete After**: 1 year of stable production use
