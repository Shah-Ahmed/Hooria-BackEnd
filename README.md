# TechProject Backend

Next.js (API routes only) + Firebase (Auth + Firestore), TypeScript. Runs on **http://localhost:3001**.

Frontend alag project hai (`techproject-frontend`, port 3000).

---

## Roles

| Role | Kaun | Kya kar sakta hai |
|---|---|---|
| `super_admin` | Sirf ek, setup script se banta hai | Organizations create / list / edit / delete (soft delete), har organization ka user limit set karna, aur organization ke users ki **sirf dekhne wali (read-only)** list. Har organization ke liye uska admin account banata hai |
| `admin` | Har organization ka ek admin | Apni organization ke users create / list / delete (soft delete), limit tak. Limit poori hone par naya user nahi bana sakta |
| `user` | Admin ke banaye hue users | Login karke apna profile dekh sakte hain |

---

## Setup

```bash
npm install
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

`.env.local` fill karo:

1. Firebase Console → project banao → **Build → Authentication → Get started → Email/Password enable**.
2. **Build → Firestore Database → Create database**.
3. **Project settings → Service accounts → Generate new private key**. JSON file se `project_id`, `client_email`, `private_key` copy karke `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` mein daalo.
   Agar Firestore mein named database banaya hai (jaise InsightX) to uska ID lowercase mein `FIREBASE_DATABASE_ID=insightx` likho. Default database ke liye isay khali chhod do.
4. `FRONTEND_ORIGIN` = frontend ka URL (`http://localhost:3000`).
5. `SUPER_ADMIN_EMAIL` aur `SUPER_ADMIN_PASSWORD` (min 8 characters) apni marzi se likho.

Super admin ek baar banao:

```bash
npm run seed:superadmin
```

Phir server chalao:

```bash
npm run dev
```

Check: http://localhost:3001/api/health → `{"status":"ok"}`

| Command | Kaam |
|---|---|
| `npm run dev` | Development server (port 3001) |
| `npm run build` / `npm run start` | Production build / server |
| `npm run typecheck` | TypeScript errors check |
| `npm run seed:superadmin` | Super admin banata / update karta hai |

> **Security:** Super admin ke credentials sirf is project ki `.env.local` mein rahenge. Inhein `.env.example` mein, GitHub par, ya kisi dusre repository mein mat daalna. `.env.local` `.gitignore` mein already blocked hai.

---

## JWT authentication (kaise kaam karta hai)

1. Frontend Firebase Auth se email/password login karta hai aur **ID token (JWT)** leta hai.
2. Har API request mein header jata hai: `Authorization: Bearer <token>`.
3. Backend (`src/lib/api.ts` ka `apiHandler`) token ko Firebase Admin se **verify** karta hai (deleted/disabled users ke tokens bhi reject hote hain).
4. Token ke andar custom claims hain: `role` aur `orgId`. Inhein account banate waqt set kiya jata hai.
5. Agar role route ke liye allowed nahi to `403`, token galat/missing ho to `401`.

---

## API endpoints

Sab endpoints par token chahiye (sirf `/api/health` public hai).

| Method | Endpoint | Role | Body | Kaam |
|---|---|---|---|---|
| GET | `/api/health` | public | - | Server check |
| GET | `/api/me` | koi bhi logged-in | - | Mera role, naam, organization |
| GET | `/api/organizations` | super_admin | - | Saari organizations (details, `userLimit`, `userCount`, `limitReached` ke saath) |
| POST | `/api/organizations` | super_admin | `name, type, address, userLimit, adminName, adminEmail, adminPassword` (optional: `description, city, country, phone, website`) | Organization + uska admin banao |
| PATCH | `/api/organizations/:id` | super_admin | koi bhi: `name, type, address, description, city, country, phone, website, userLimit` | Organization ki details / user limit badlo |
| GET | `/api/organizations/:id/users` | super_admin | - | Organization ke users ki **read-only** list (admin + users). Is par koi create / edit / delete route nahi hai |
| GET | `/api/my-organization` | admin | - | Meri organization ki details, user limit, kitne users hain, `limitReached` |
| DELETE | `/api/organizations/:id` | super_admin | - | Organization "delete" (soft): organization aur uske saare users ka `isActive` false, login disable. Record database mein rehta hai |
| GET | `/api/users` | admin | - | Meri organization ke users |
| POST | `/api/users` | admin | `name, email, password` | Meri organization mein user banao. Limit poori ho to `403` ("User limit reached ...") |
| DELETE | `/api/users/:id` | admin | - | Meri organization ka user "delete" (soft): `isActive` false, login disable. Record database mein rehta hai |

Errors is shape mein aate hain: `{ "error": "message" }`.

---

## Folder structure

```
scripts/
└── seed-super-admin.ts           # Super admin banane ki script (sirf tumhari machine par)
src/
├── app/
│   ├── page.tsx                  # "API is running" page
│   └── api/
│       ├── health/route.ts
│       ├── me/route.ts
│       ├── organizations/route.ts
│       ├── organizations/[id]/route.ts
│       ├── organizations/[id]/users/route.ts   # super admin ke liye read-only users list
│       ├── my-organization/route.ts            # admin: apni organization + limit
│       ├── users/route.ts
│       └── users/[id]/route.ts
├── lib/
│   ├── api.ts                    # CORS, JWT verify, role check, error handling
│   ├── accounts.ts               # Auth user + Firestore profile create / soft delete (deactivate)
│   ├── orgs.ts                   # Organization helpers: users count, limit, details validation
│   ├── firebaseAdmin.ts          # Firebase Admin init
│   ├── validate.ts               # Input validation
│   └── errors.ts                 # HttpError
└── types/index.ts                # Role, UserDoc, OrganizationDoc
firestore.rules                   # Browser se direct Firestore access band
```

### Naya endpoint banane ka tareeqa

```ts
// src/app/api/example/route.ts
import { apiHandler, json, preflight } from "@/lib/api";

export const OPTIONS = preflight;                       // CORS ke liye zaroori

export const GET = apiHandler({ roles: ["admin"] }, async ({ auth }) => {
  return json({ hello: auth.email, org: auth.orgId });
});
```

---

## Firestore data

- `users/{uid}` → `{ name, email, role, orgId, createdAt, isActive }`. Document id hi user ki id hai, document ke andar alag `user_id` field nahi hai.
- `organizations/{orgId}` → `{ name, type, description, address, city, country, phone, website, userLimit, adminUid, adminName, adminEmail, createdAt, isActive }`

Purani organizations (jinmein nayi fields nahi hain) ab bhi chalti hain: nayi fields khali dikhti hain aur `userLimit` na ho to koi limit nahi lagti, jab tak super admin set na kare.

### User limit kaise kaam karta hai

- Limit `POST /api/users` ke **code** mein check hoti hai (`src/app/api/users/route.ts`). Firebase Authentication ya Firestore rules ka isse koi taalluq nahi.
- Sirf normal users (role `user`) gine jaate hain, organization admin nahi. Soft-deleted users nahi gine jaate.
- Do requests ek saath aayein to bhi limit cross nahi hoti (har organization ke liye create ek ek karke chalta hai).
- Super admin limit ko current users se kam par bhi set kar sakta hai: purane users rehte hain, bas naya koi add nahi hota.

Database sirf backend (Admin SDK) se access hota hai. `firestore.rules` mein direct access band hai (Firebase Console mein ye rules publish kar sakte ho).
