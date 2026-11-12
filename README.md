# Taskdesk

A multi-role task board built with React, Vite, Tailwind CSS, Express, MongoDB, Socket.IO and Nodemailer.

## Run locally

Use Node.js 22.12+ or Node 24, npm, and a running MongoDB instance (local or Atlas).

1. Open a terminal in the extracted taskdesk folder, beside package.json.
2. Install dependencies and copy the server settings. On Windows PowerShell run:

   ```powershell
   npm.cmd ci
   Copy-Item .env.example .env
   node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
   ```

   On macOS or Linux use `npm ci` and `cp .env.example .env`.
3. Paste the generated secret into JWT_SECRET in .env. The default MONGO_URI points to a local MongoDB on port 27017. For Atlas, enter your database connection string and allow your application host to connect.
4. Set separate random values for ADMIN_INVITE_CODE and MANAGER_INVITE_CODE to enable registration for those roles. Give each code only to people authorized for that role. Standard users register directly.
5. For assignment and update email, set SMTP_HOST, SMTP_PORT, MAIL_FROM and any required SMTP_USER and SMTP_PASS. Use port 465 for implicit TLS or 587 for STARTTLS. Without an SMTP host, task changes and live updates still work. Delivery failures are logged to the server and do not roll back saved tasks.
6. Run `npm run dev` (or `npm.cmd run dev` in PowerShell). Open http://localhost:5173. The API listens on http://localhost:4000. For other origins or ports, update CLIENT_ORIGIN in the root .env and VITE_API_URL in client/.env.local using client/.env.example.

## Roles and workflow

| Role | Visible tasks | Actions |
| --- | --- | --- |
| Admin | All | Create, edit, delete and assign any task. Browse the paginated member directory. |
| Manager | Created by or assigned to the manager | Create and manage own tasks. Assign to self or any standard user. Update progress on tasks assigned by someone else. |
| User | Assigned to the user | Create and manage personal tasks. Update progress on assigned tasks. |

Open **New task**, enter a title, select an assignee and due date, then save. To change status, drag a card between columns or open it and use the Status menu. Each column has independent pagination. Search matches titles and the priority filter applies across columns.

To try multiple roles, sign in as a manager in one browser and as a standard user in a second browser. Assign a task to the user. Both boards refresh automatically. Open the card in the user's browser, mark it Completed, and check the manager's board.

## API

Requests use JSON. Authenticated endpoints require `Authorization: Bearer <token>`. Registration and login return `{ token, user: { id, name, role } }`. Tokens expire after eight hours.

| Method and path | Inputs and result |
| --- | --- |
| POST /api/auth/register | name, email, password, optional role (admin, manager, user), inviteCode for elevated roles. Returns 201 and a session. |
| POST /api/auth/login | email, password. Returns a session. |
| GET /api/tasks | Optional q (title), status, priority, page and limit. Returns items, total. Each item includes assignee details, creator ID and timestamps. |
| POST /api/tasks | Required title and dueDate (YYYY-MM-DD). Optional description, assignee (user ID, defaults to self), priority and status. Returns the created task. |
| PATCH /api/tasks/:id | Any editable task fields. Assignees who are neither creators nor admins may send only status. Returns the updated task. |
| DELETE /api/tasks/:id | Creator or admin. Returns 204. |
| GET /api/users | Admin directory. Use assignable=1 for the assignment picker, available to every role. Supports q (name), page and limit. Returns items, total. |
| GET /health | Database readiness. Returns 200 or 503. |

Statuses are Pending, In Progress and Completed. Priorities are Low, Medium and High. List endpoints default to page 1 and limit 12, with a maximum limit of 100. Errors return an error message in JSON. Typical responses include 400 for invalid input, 401 for invalid sessions, 403 for denied operations, 404 for unavailable tasks, 409 for conflicting writes and 429 for repeated authentication attempts.

Socket.IO clients connect to the backend origin with `auth: { token }`. The tasks:changed event tells authorized dashboards to refetch their current filters. Reassignment refreshes the former assignee's dashboard too. Email goes to the current assignee on creation and updates.

## Production setup

1. Place this folder in a Git repository and provision MongoDB.
2. Create a Render Blueprint using render.yaml. Set MONGO_URI and CLIENT_ORIGIN, and add the invitation and SMTP settings from .env.example. The blueprint generates JWT_SECRET. The server uses Render's PORT.
3. Import the same repository into Vercel with the project root set to this folder. vercel.json installs dependencies, builds the client and publishes client/dist. Set VITE_API_URL to the HTTPS Render origin **before building**.
4. Set CLIENT_ORIGIN on Render to the exact HTTPS Vercel origin without a trailing slash. Verify /health on Render and register a user from the deployed frontend. Rebuild the client after changing VITE_API_URL.

## Checks

Run `npm test` for the role-policy tests and `npm run build` for the production frontend bundle.

