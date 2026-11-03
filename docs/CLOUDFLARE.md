# הגדרת Cloudflare – טבלת הנזילות המשותפת

הכלי רץ כ-Worker בשם `family-house-report`. הקבצים הסטטיים מוגשים כ-assets, ונתיב `/api/liquidity` מטופל על ידי `worker/index.js`.
בטבלה נשמרים רק **שם מנהל וסוג נזילות** (ומי עדכן ומתי). נתוני לקוח לא נשמרים לעולם.

עד שמשלימים את שלב 1, הכלי עובד במצב מקומי: הטבלה נשמרת בדפדפן בלבד.
עד שמשלימים את שלב 2, הטבלה המשותפת זמינה לצפייה בלבד.

## שלב 1 – אחסון (KV)
1. ב-Cloudflare: **Storage & Databases → Workers KV → Create instance** ובשם `family-house-liquidity`.
2. מעתיקים את ה-**ID** של ה-namespace.
3. ב-`wrangler.jsonc` מוסיפים, או מבקשים מקלוד להוסיף:
   ```jsonc
   ,"kv_namespaces": [{ "binding": "LIQUIDITY", "id": "<ה-ID>" }]
   ```
4. מבצעים commit ו-push. Cloudflare פורס אוטומטית.

## שלב 2 – הרשאות עריכה (Cloudflare Access)
עריכת הטבלה מותרת רק למשתמש שנכנס דרך Cloudflare Access. ה-Worker מאמת את חתימת ה-JWT של Access ואינו סומך על header פשוט.

1. ב-Worker נכנסים ל-**Settings → Domains & Routes**. ליד `workers.dev` לוחצים **Enable Cloudflare Access**, או נכנסים ללשונית **Access**.
2. מגדירים מדיניות **Allow** למיילים שמסתיימים ב-`@zviran.co.il`, או לרשימה ספציפית של כתובות.
3. במסך אפליקציית ה-Access שנוצרה (**Zero Trust → Access → Applications → האפליקציה → Overview**) מעתיקים:
   - **Application Audience (AUD) Tag**
   - **Team domain**, למשל `zviran.cloudflareaccess.com`. נמצא ב-Zero Trust → Settings → Custom pages או במסך ה-Overview.
4. ב-Worker: **Settings → Variables and Secrets → Add**:
   - `ACCESS_TEAM_DOMAIN` = ה-team domain, בלי `https://`
   - `ACCESS_AUD` = ה-AUD tag
5. שמירה ופריסה (Deploy). המשתנים נשמרים גם בפריסות הבאות, כי `keep_vars: true`.

## בדיקה
- `https://<worker>/admin` צריך להראות "טבלה משותפת (Cloudflare) · מחובר כ-<המייל>".
- אם מוצג "צפייה בלבד", המשתנים בשלב 2 חסרים או לא תואמים.
- אם מוצג "מצב מקומי", ה-KV בשלב 1 לא מחובר.

## פיתוח מקומי
```bash
npx wrangler dev   # עם KV מקומי; להרשאות עריכה בלי Access:
# REQUIRE_ACCESS=false מוגדר כמשתנה מקומי, למשל בקובץ .dev.vars (לא נכנס לריפו)
```
