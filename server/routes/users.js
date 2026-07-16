const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

function attachCounts(user, viewerId) {
  const followers_count = db.prepare('SELECT COUNT(*) c FROM follows WHERE following_id = ?').get(user.id).c;
  const following_count = db.prepare('SELECT COUNT(*) c FROM follows WHERE follower_id = ?').get(user.id).c;
  const posts_count = db.prepare('SELECT COUNT(*) c FROM posts WHERE user_id = ?').get(user.id).c;
  let is_following = false;
  if (viewerId) {
    is_following = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, user.id);
  }
  return { ...publicUser(user), followers_count, following_count, posts_count, is_following };
}

// Search / list users
router.get('/', optionalAuth, (req, res) => {
  const q = req.query.q;
  let users;
  if (q) {
    users = db.prepare('SELECT * FROM users WHERE username LIKE ? ORDER BY username LIMIT 20').all(`%${q}%`);
  } else {
    users = db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 20').all();
  }
  res.json({ users: users.map(u => attachCounts(u, req.userId)) });
});

// Get single profile
router.get('/:id', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: attachCounts(user, req.userId) });
});

// Update own profile
router.put('/:id', requireAuth, (req, res) => {
  if (Number(req.params.id) !== req.userId) {
    return res.status(403).json({ error: 'You can only edit your own profile' });
  }
  const { bio } = req.body;
  db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio ?? '', req.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: attachCounts(user, req.userId) });
});

// Posts by a user
router.get('/:id/posts', optionalAuth, (req, res) => {
  const posts = db.prepare(`
    SELECT p.*, u.username, u.avatar_color,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ?
    ORDER BY p.created_at DESC
  `).all(req.userId || 0, req.params.id);
  res.json({ posts: posts.map(p => ({ ...p, liked_by_me: !!p.liked_by_me })) });
});

// Followers list
router.get('/:id/followers', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.* FROM users u
    JOIN follows f ON f.follower_id = u.id
    WHERE f.following_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json({ users: rows.map(u => attachCounts(u, req.userId)) });
});

// Following list
router.get('/:id/following', optionalAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT u.* FROM users u
    JOIN follows f ON f.following_id = u.id
    WHERE f.follower_id = ?
    ORDER BY f.created_at DESC
  `).all(req.params.id);
  res.json({ users: rows.map(u => attachCounts(u, req.userId)) });
});

// Follow a user
router.post('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.userId) {
    return res.status(400).json({ error: "You can't follow yourself" });
  }
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return res.status(404).json({ error: 'User not found' });

  try {
    db.prepare('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)').run(req.userId, targetId);
  } catch (e) {
    // already following - ignore (idempotent)
  }
  res.json({ following: true });
});

// Unfollow a user
router.delete('/:id/follow', requireAuth, (req, res) => {
  db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(req.userId, req.params.id);
  res.json({ following: false });
});

module.exports = router;
