const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Delete own comment
router.delete('/:id', requireAuth, (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.userId) {
    return res.status(403).json({ error: 'You can only delete your own comments' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
