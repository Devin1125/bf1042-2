# 00_demo01 - V9 (Better Auth + Google OAuth)

聯大資工早餐訂餐系統 - 完整版

## 專案概述

這是一個完整的全端點餐系統，採用「開發分離、部署整合」架構：

**技術棧**：

- 🔧 後端：Elysia v1.4+ (TypeScript) + Drizzle ORM
- ⚛️ 前端：React 19 + Vite + DaisyUI
- 🔐 認證：Better Auth v1.6+ (Google OAuth only)
- 🛡️ 權限：V10 RBAC（customer / staff / chef / owner / admin）
- 🗄️ 資料庫：PostgreSQL (Neon Serverless)
- 📋 API 規格：OpenAPI 3.0 (自動生成 Swagger UI)
- 🎯 架構模式：三層架構 (contracts → route-schemas → backend)

**特色**：

- ✅ 單一事實來源（Zod schemas）
- ✅ 前後端型別安全共享
- ✅ Google OAuth 登入（無密碼管理）
- ✅ Session-based 認證（HttpOnly cookies）
- ✅ RBAC 角色權限、角色申請審核、使用者角色管理
- ✅ 店員/廚師營運工作台、訂單狀態追蹤、營收摘要
- ✅ 完整的訂單流程（購物車 → 送出 → 歷史記錄）

## V10 RBAC 權限系統

| 角色 | 權限 |
| --- | --- |
| `customer` | 查看菜單、建立購物車、送出訂單、查看自己的訂單 |
| `staff` | 查看所有訂單與營運摘要 |
| `chef` | 查看所有訂單，更新廚房狀態 |
| `owner` | 管理菜單，查看營運摘要，更新訂單狀態 |
| `admin` | 管理所有角色與角色申請 |

| API | 權限 |
| --- | --- |
| `GET /api/orders` | 已登入；依角色回傳不同訂單資料 |
| `POST /api/menu` | `owner` / `admin` |
| `PATCH /api/menu/:id` | `owner` / `admin` |
| `DELETE /api/menu/:id` | `owner` / `admin` |
| `PATCH /api/orders/:id/status` | `chef` / `owner` / `admin` |
| `POST /api/users/me/role-request` | 已登入 |
| `GET /api/admin/role-requests` | `admin` |
| `PATCH /api/admin/role-requests/:id` | `admin` |
| `PATCH /api/admin/users/:userId/roles` | `admin` |

### 角色看到的訂單資料

`GET /api/orders` 不是單純「有登入就回全部」，後端會依角色回傳不同資料：

| 角色 | 回傳資料 |
| --- | --- |
| `customer` | 只回傳自己的訂單 |
| `staff` | 只回傳已送出的櫃台訂單，不含顧客尚未送出的購物車 |
| `chef` | 只回傳廚房需要處理的訂單：`submitted` / `preparing` / `ready` |
| `owner` | 回傳全店所有訂單，供營運與菜單管理使用 |
| `admin` | 回傳全店所有訂單，並可管理角色與使用者 |

建立第一個 admin：先用 Google 登入一次，再執行：

```bash
bun run admin:create your-email@example.com
```

套用 RBAC migration：

```bash
bun run db:migrate
```

REST 測試範例在 `test_rbac.rest`。

## 快速開始

### 1. 安裝依賴

在專案根目錄執行（會同時安裝 frontend 依賴）：

```bash
bun install
```

### 2. 環境變數設定

複製環境變數範本：

```bash
cp .env.example .env
```

編輯 `.env` 並填入必要資訊：

```env
# 伺服器設定
PORT=3000
HOST=localhost

# PostgreSQL 資料庫 (Neon)
DATABASE_URL=postgresql://user:pass@host-pooler.region.aws.neon.tech/dbname?sslmode=require
DATABASE_URL_MIGRATION=postgresql://user:pass@host.region.aws.neon.tech/dbname?sslmode=require
STORE_DRIVER=postgres
PG_SCHEMA=bf_v10

# Better Auth 設定
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=你的隨機密鑰_至少32字元

# Google OAuth 2.0
GOOGLE_CLIENT_ID=你的-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-你的-google-secret
```

**環境變數說明**：

| 變數名稱                 | 說明                                   | 範例                                                                    |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| `PORT`                   | 後端監聽埠號                           | `3000`                                                                  |
| `HOST`                   | 後端監聽位址                           | `localhost` 或 `0.0.0.0`                                                |
| `DATABASE_URL`           | Neon Pooled Connection（一般查詢用）   | `postgresql://...pooler...`                                             |
| `DATABASE_URL_MIGRATION` | Neon Direct Connection（migration 用） | `postgresql://...`                                                      |
| `STORE_DRIVER`           | 資料儲存驅動                           | `postgres`（生產）或 `json`（開發）                                     |
| `PG_SCHEMA`              | PostgreSQL schema 名稱                 | `bf_v10`（建議不用 `public`）                                           |
| `BETTER_AUTH_URL`        | Better Auth 基礎 URL                   | 本地：`http://localhost:3000`<br/>生產：`https://your-app.onrender.com` |
| `BETTER_AUTH_SECRET`     | Better Auth 加密密鑰                   | 至少 32 字元隨機字串                                                    |
| `GOOGLE_CLIENT_ID`       | Google OAuth Client ID                 | 從 Google Cloud Console 取得                                            |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth Secret                    | 從 Google Cloud Console 取得                                            |

**如何取得 Google OAuth 憑證**：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用「Google+ API」
4. 建立「OAuth 2.0 用戶端 ID」（應用程式類型：網頁應用程式）
5. 設定授權重新導向 URI：
   - 本地開發：`http://localhost:3000/api/auth/callback/google`
   - 生產環境：`https://your-app.onrender.com/api/auth/callback/google`
6. 複製 Client ID 和 Client Secret 到 `.env`

**如何生成 BETTER_AUTH_SECRET**：

```bash
# 方法 1：使用 openssl
openssl rand -hex 32

# 方法 2：使用 Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 方法 3：使用 Bun
bun -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. 資料庫設定

**建立 Neon 資料庫**：

1. 前往 [Neon Console](https://console.neon.tech/)
2. 建立新專案
3. 複製 Connection String（需要 Pooled 和 Direct 兩種）
4. 填入 `.env` 的 `DATABASE_URL` 和 `DATABASE_URL_MIGRATION`

**執行 Database Migration**：

```bash
# 生成 migration 檔案（當 schema 變更時）
bun run db:generate

# 執行 migration（套用到資料庫）
bun run db:migrate
```

**快速推送 Schema（開發用）**：

```bash
# 直接推送當前 schema 到資料庫（不生成 migration 檔案）
bun run db:push
```

**查看資料庫內容**：

```bash
# 啟動 Drizzle Studio（視覺化資料庫管理介面）
bun run db:studio
# 訪問 https://local.drizzle.studio
```

**清空測試數據**：

```bash
# 清空所有訂單和用戶數據（保留菜單）
bun run db:reset
```

**資料庫 Schema 結構**：

V10 使用獨立的 PostgreSQL schema (`bf_v10`)，包含以下資料表：

| 資料表         | 說明                   | 關鍵欄位                           |
| -------------- | ---------------------- | ---------------------------------- |
| `menu_items`   | 菜單資料               | `id`, `name`, `price`, `category`  |
| `orders`       | 訂單主表               | `id`, `user_id`, `total`, `status` |
| `order_items`  | 訂單項目               | `order_id`, `item_id`, `qty`       |
| `user`         | Better Auth 用戶表     | `id`, `email`, `name`              |
| `session`      | Better Auth 會話表     | `token`, `expires_at`              |
| `account`      | Better Auth OAuth 連結 | `provider_id`, `user_id`           |
| `verification` | Better Auth 驗證記錄   | `identifier`, `value`              |

## 開發模式

### 同時啟動前後端（推薦）

```bash
bun run dev
```

- 🔧 後端 API：`http://localhost:3000`
- ⚛️ 前端開發伺服器：`http://localhost:5173`
- 🔄 Vite 會自動代理 `/api/*` 到後端

**開發時請訪問**：`http://localhost:5173`

### 分別啟動

```bash
# 只啟動前端
bun run dev:frontend

# 只啟動後端
bun run dev:backend
```

### 開發階段常見問題

#### Q1: 開發時應該訪問哪個網址？

**A**: 訪問 `http://localhost:5173`（前端開發伺服器）

- ✅ 正確：`http://localhost:5173` → 完整功能 + Hot reload
- ❌ 錯誤：`http://localhost:3000` → 只有 API，沒有前端畫面

#### Q2: 為什麼 3000 port 沒有前端畫面？

**A**: 因為開發模式下，前端由 Vite 伺服器提供（5173），後端只提供 API。

要在 3000 看到完整網站，需要先 build 前端：

```bash
bun run build:frontend
bun run dev:backend
```

然後訪問 `http://localhost:3000`（此時變成整合模式）。

#### Q3: 如何清理舊的 backend 行程？

如果遇到 port 衝突或奇怪的行為，執行：

```bash
# 清理所有佔用 3000 的行程
fuser -k 3000/tcp || true

# 或清理所有 bun backend 行程
pkill -f "bun.*backend" || true
```

### npm scripts 完整列表

| 指令                       | 說明                          |
| -------------------------- | ----------------------------- |
| `bun run dev`              | 並行啟動前後端開發伺服器      |
| `bun run dev:backend`      | 只啟動後端（watch 模式）      |
| `bun run dev:frontend`     | 只啟動前端（Vite 開發伺服器） |
| `bun run build`            | 打包前後端（部署前執行）      |
| `bun run build:frontend`   | 只打包前端 → `public/`        |
| `bun run build:backend`    | 只打包後端 → `dist/`          |
| `bun run start`            | 啟動生產環境（需先 build）    |
| `bun run preview:frontend` | 預覽前端 build 結果           |
| `bun run db:generate`      | 生成 migration 檔案           |
| `bun run db:migrate`       | 執行 migration                |
| `bun run db:push`          | 快速推送 schema（開發用）     |
| `bun run db:studio`        | 啟動 Drizzle Studio           |
| `bun run db:reset`         | 清空測試數據（保留菜單）      |

## 建置與部署

### 本地測試生產版本

```bash
# 1. 打包前後端
bun run build

# 2. 啟動生產模式
bun run start
```

訪問 `http://localhost:3000` 查看完整網站。

**build 輸出**：

- 前端：`public/` （靜態檔案，由後端提供）
- 後端：`dist/backend.js` （打包後的 Node.js 程式）

### 部署到 Render.com

#### 前置準備

1. **推送程式碼到 GitHub**

```bash
# 如果在開發分支，先合併到 main
git checkout main
git merge feat/v9-clean-better-auth-v2  # 或你的開發分支名稱

# 推送到 GitHub（Render 會監看 main 分支）
git push origin main
```

2. **在 Render.com 建立 Web Service**

- 前往 [Render Dashboard](https://dashboard.render.com/)
- 點擊「New +」 → 「Web Service」
- 連結你的 GitHub repository
- 選擇 branch：`main`

#### 部署設定

**基本設定**：

| 欄位           | 值                             |
| -------------- | ------------------------------ |
| Name           | `bf1042-v9` 或自訂名稱         |
| Region         | `Singapore` 或最近的區域       |
| Branch         | `main`                         |
| Root Directory | 留空（或 `./`）                |
| Runtime        | `Node`                         |
| Build Command  | `bun install && bun run build` |
| Start Command  | `bun run start`                |
| Instance Type  | `Free` 或 `Starter`            |

**環境變數設定**：

在 Render 的「Environment」頁面新增以下變數：

```env
# 伺服器設定
PORT=3000
HOST=0.0.0.0

# PostgreSQL
DATABASE_URL=postgresql://user:pass@host-pooler.region.aws.neon.tech/dbname?sslmode=require
DATABASE_URL_MIGRATION=postgresql://user:pass@host.region.aws.neon.tech/dbname?sslmode=require
STORE_DRIVER=postgres
PG_SCHEMA=bf_v10

# Better Auth（❗ 重要：使用正式網址）
BETTER_AUTH_URL=https://你的app名稱.onrender.com
BETTER_AUTH_SECRET=你的隨機密鑰_至少32字元

# Google OAuth（❗ 重要：需更新 redirect URI）
GOOGLE_CLIENT_ID=你的-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-你的-google-secret
```

**❗ 特別注意**：

1. **BETTER_AUTH_URL** 必須改成正式網址：`https://你的app名稱.onrender.com`
2. **Google OAuth Redirect URI** 必須新增生產環境網址：
   - 前往 [Google Cloud Console](https://console.cloud.google.com/)
   - OAuth 2.0 用戶端 → 編輯
   - 授權重新導向 URI 新增：`https://你的app名稱.onrender.com/api/auth/callback/google`
   - 儲存變更

#### 首次部署後的檢查清單

- [ ] 網站可以正常訪問：`https://你的app名稱.onrender.com`
- [ ] 點擊「使用 Google 登入」會導向 Google 授權頁
- [ ] Google 授權後能正確回調並顯示已登入狀態
- [ ] 菜單資料正常顯示
- [ ] 加入購物車功能正常
- [ ] 送出訂單功能正常
- [ ] 訂單歷史可查詢

#### 持續部署（CI/CD）

Render 預設啟用自動部署，當你推送到指定 branch 時會自動觸發部署：

```bash
# 修改程式碼
git add .
git commit -m "fix: 修正某個功能"
git push origin main

# Render 會自動偵測並部署
```

#### 常見部署問題

##### 問題 1：Google 登入後顯示「redirect_uri_mismatch」

**原因**：Google OAuth 設定中沒有加入生產環境的 redirect URI

**解決**：

1. 前往 Google Cloud Console
2. 編輯 OAuth 2.0 用戶端
3. 新增：`https://你的app名稱.onrender.com/api/auth/callback/google`

##### 問題 2：Build 失敗，顯示「command not found: bun」

**原因**：Render 預設使用 npm/yarn，需要安裝 bun

**解決**：修改 Build Command 為：

```bash
npm install -g bun && bun install && bun run build
```

或在專案根目錄新增 `.node-version` 檔案指定 Node.js 版本。

##### 問題 3：啟動後立即崩潰，顯示「DATABASE_URL is required」

**原因**：環境變數未正確設定

**解決**：

1. 檢查 Render Environment 頁面
2. 確認所有必要環境變數都已填入
3. 重新部署

##### 問題 4：Free tier 冷啟動很慢

**說明**：Render Free tier 在閒置 15 分鐘後會進入睡眠，下次訪問需要 30-60 秒喚醒

**解決方案**：

- 升級到 Starter ($7/月) 可避免冷啟動
- 或使用 cron 服務定時 ping 你的網站

### 其他部署平台

本專案也可部署到：

- **Railway**: 類似 Render，支援 bun runtime
- **Fly.io**: 適合需要多區域部署
- **Vercel**: 需要分離前後端部署（前端 Vercel，後端另選）
- **AWS/GCP/Azure**: 適合大型生產環境

## 專案架構

### 目錄結構

```
00_demo01/
├── backend.ts              # Elysia 後端主程式
├── auth/
│   ├── better-auth.ts      # Better Auth 設定與 getCurrentUser()
│   └── user-mapper.ts      # DB User → SessionUser 轉換
├── db/
│   ├── client.ts           # Drizzle 客戶端
│   ├── schema.ts           # 業務資料表定義
│   └── auth-schema.ts      # Better Auth 資料表定義
├── shared/
│   ├── contracts.ts        # 第1事實：業務物件 schemas
│   └── route-schemas.ts    # 第2事實：API 規格 schemas
├── store/
│   └── index.ts            # 業務邏輯層（訂單、菜單管理）
├── frontend/               # React 前端
│   ├── src/
│   │   └── App.tsx         # 前端主程式
│   ├── dist/               # build 輸出（gitignore）
│   └── package.json
├── public/                 # 前端 build 產物（後端靜態資源）
├── scripts/
│   ├── reset-database.ts   # 資料庫初始化腳本
│   └── run-migration.ts    # 手動 migration 執行
├── drizzle/                # Migration 檔案
├── .env                    # 環境變數（gitignore）
└── package.json
```

### 三層架構設計

V9 採用嚴格的三層架構，確保程式碼可維護性：

```
┌─────────────────────────────────────┐
│   shared/contracts.ts               │ ← 第1事實：業務物件
│   (MenuItem, Order, SessionUser)    │
└─────────────────────────────────────┘
              ↓ import
┌─────────────────────────────────────┐
│   shared/route-schemas.ts           │ ← 第2事實：API 規格
│   (CreateOrderBody, OrderResponse)  │
└─────────────────────────────────────┘
              ↓ import
┌─────────────────────────────────────┐
│   backend.ts                        │ ← 第3層：路由實作
│   (Elysia routes)                   │
└─────────────────────────────────────┘
```

**設計原則**：

- ✅ `backend.ts` 不能有 inline `z.object()`
- ✅ `backend.ts` 只能 import `route-schemas.ts`
- ✅ `contracts.ts` 定義業務物件，不包含 API 專用欄位
- ✅ `route-schemas.ts` 可以擴展 contracts，加入 API 專用欄位

**優點**：

- 更換認證方式時，業務邏輯零修改（實驗證明 ✅）
- 前後端共享型別定義，保證一致性
- API 規格集中管理，容易維護
- 支援自動生成 OpenAPI 文件

詳見教學文件：`00_demo01-docs/00_teaching/02_4_Schema一致性設計_Zod與Drizzle多層架構.md`

## API 文件

### OpenAPI / Swagger UI

啟動後端後訪問：

```
http://localhost:3000/swagger
```

自動生成的 API 文件包含：

- 所有端點的 request/response schemas
- 互動式測試介面
- 可下載 OpenAPI JSON

### 主要 API 端點

| 端點                       | 方法  | 說明         | 需認證 |
| -------------------------- | ----- | ------------ | ------ |
| `/health`                  | GET   | 健康檢查     | ❌     |
| `/api/auth/sign-in/social` | POST  | Google 登入  | ❌     |
| `/api/auth/sign-out`       | POST  | 登出         | ✅     |
| `/api/auth/get-session`    | GET   | 取得當前會話 | ✅     |
| `/api/menu`                | GET   | 取得菜單     | ❌     |
| `/api/orders`              | POST  | 建立訂單     | ✅     |
| `/api/orders/current`      | GET   | 取得當前訂單 | ✅     |
| `/api/orders/:id`          | PATCH | 更新訂單項目 | ✅     |
| `/api/orders/:id/submit`   | POST  | 送出訂單     | ✅     |
| `/api/orders/history`      | GET   | 訂單歷史     | ✅     |

## 學習資源

### 相關講義

專案配套教學文件位於 `00_demo01-docs/00_teaching/`：

- `01_版本閱讀指南.md` - 各版本演進說明
- `02_4_Schema一致性設計_Zod與Drizzle多層架構.md` - 架構設計理念
- `03_1_Drizzle+Neon_註冊與升級實作步驟清單.md` - 資料庫設定
- `03_2_V8_合併主線與_Render_最小部署_CI_CD_教案手冊.md` - 部署教學

### 技術文件連結

- [Elysia 官方文件](https://elysiajs.com/)
- [Better Auth 官方文件](https://better-auth.com/)
- [Drizzle ORM 官方文件](https://orm.drizzle.team/)
- [Neon PostgreSQL 官方文件](https://neon.tech/docs)
- [React 19 官方文件](https://react.dev/)

## 授權

此專案為教學用途，遵循 MIT License。
