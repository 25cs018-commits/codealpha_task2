# Nook — Mini Social Media App

A small full-stack social app: profiles, posts, comments, likes, and follows.

## Stack
- **Backend:** Express.js + SQLite (via `better-sqlite3`), JWT auth, bcrypt password hashing
- **Frontend:** Vanilla HTML / CSS / JavaScript (no build step, no framework)

## Setup

```bash
cd server
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

The server creates `server/social.db` automatically on first run — no separate database install needed.

## Configuration

Edit `server/.env` to change the port or JWT secret:

```
PORT=3000
JWT_SECRET=change-this-secret-key-in-production
```

## Features

- **Auth:** register / log in (JWT stored in the browser, 7-day expiry)
- **Profiles:** username, bio (editable), avatar color, post/follower/following counts
- **Posts:** create, delete (own posts only), text up to 2000 characters
- **Comments:** reply to any post, delete your own replies
- **Likes:** like/unlike any post
- **Follows:** follow/unfollow other users; "Your feed" shows posts from people you follow (+ your own); "Everyone" shows the global feed
- **Search:** find people by username

## API overview

| Method | Route | Description |
|---|---|---|
| POST | /api/auth/register | Create an account |
| POST | /api/auth/login | Log in |
| GET | /api/auth/me | Current user |
| GET | /api/users?q= | Search / list users |
| GET | /api/users/:id | Profile + counts |
| PUT | /api/users/:id | Update own bio |
| GET | /api/users/:id/posts | A user's posts |
| GET | /api/users/:id/followers | Followers list |
| GET | /api/users/:id/following | Following list |
| POST/DELETE | /api/users/:id/follow | Follow / unfollow |
| GET | /api/posts | Feed (add `?all=1` for global feed) |
| POST | /api/posts | Create a post |
| DELETE | /api/posts/:id | Delete own post |
| POST/DELETE | /api/posts/:id/like | Like / unlike |
| GET/POST | /api/posts/:id/comments | List / add comments |
| DELETE | /api/comments/:id | Delete own comment |

## Project structure

```
server/
  server.js          entry point
  db.js              SQLite schema + connection
  middleware/auth.js  JWT middleware
  routes/            auth, users, posts, comments
  public/            frontend (index.html, style.css, app.js)
```
