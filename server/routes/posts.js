const express = require('express');
const db = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

function postWithMeta(row) {
  return { ...row, liked_by_me: !!row.liked_by_me };
}

// Feed: posts from people the current user follows + their own posts.
// If not logged in, or ?all=1, show all posts (global feed).
router.get('/', optionalAuth, (req, res) => {
  const showAll = req.query.all === '1' || !req.userId;

  const baseSelect = `
    SELECT p.*, u.username, u.avatar_color,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
  `;

  let posts;
  if (showAll) {
    posts = db.prepare(`${baseSelect} ORDER BY p.created_at DESC LIMIT 100`).all(req.userId || 0);
  } else {
    posts = db.prepare(`
      ${baseSelect}
      WHERE p.user_id = ? OR p.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?)
      ORDER BY p.created_at DESC LIMIT 100
    `).all(req.userId || 0, req.userId, req.userId);
  }

  res.json({ posts: posts.map(postWithMeta) });
});

// Get single post
router.get('/:id', optionalAuth, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar_color,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as comments_count,
      (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.user_id = ?) as liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(req.userId || 0, req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: postWithMeta(post) });
});

// Create post
router.post('/', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Post content cannot be empty' });
  }
  if (content.length > 2000) {
    return res.status(400).json({ error: 'Post content too long (max 2000 chars)' });
  }
  const info = db.prepare('INSERT INTO posts (user_id, content) VALUES (?, ?)').run(req.userId, content.trim());
  const post = db.prepare(`
    SELECT p.*, u.username, u.avatar_color, 0 as likes_count, 0 as comments_count, 0 as liked_by_me
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({ post: postWithMeta(post) });
});

// Delete own post
router.delete('/:id', requireAuth, (req, res) => {
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.user_id !== req.userId) return res.status(403).json({ error: 'You can only delete your own posts' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Like a post
router.post('/:id/like', requireAuth, (req, res) => {
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  try {
    db.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').run(req.params.id, req.userId);
  } catch (e) {
    // already liked - ignore
  }
  const likes_count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: true, likes_count });
});

// Unlike a post
router.delete('/:id/like', requireAuth, (req, res) => {
  db.prepare('DELETE FROM likes WHERE post_id = ? AND user_id = ?').run(req.params.id, req.userId);
  const likes_count = db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: false, likes_count });
});

// Get comments for a post
router.get('/:id/comments', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username, u.avatar_color
    FROM comments c JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ?
    ORDER BY c.created_at ASC
  `).all(req.params.id);
  res.json({ comments });
});

// Add a comment
router.post('/:id/comments', requireAuth, (req, res) => {
  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Comment cannot be empty' });
  }
  const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const info = db.prepare('INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.params.id, req.userId, content.trim());
  const comment = db.prepare(`
    SELECT c.*, u.username, u.avatar_color FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);
  res.status(201).json({ comment });
});

module.exports = router;
