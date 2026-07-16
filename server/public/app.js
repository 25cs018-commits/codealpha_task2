(() => {
  const API = '/api';
  let state = {
    token: localStorage.getItem('nook_token') || null,
    user: JSON.parse(localStorage.getItem('nook_user') || 'null'),
    view: 'feed',
    viewingUserId: null,
    profileTab: 'posts',
  };

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function initials(name) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function timeAgo(iso) {
    const then = new Date(iso.replace(' ', 'T') + 'Z');
    const diff = Math.floor((Date.now() - then.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 2592000) return Math.floor(diff / 86400) + 'd ago';
    return then.toLocaleDateString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg) {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 2200);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  function setSession(token, user) {
    state.token = token;
    state.user = user;
    localStorage.setItem('nook_token', token);
    localStorage.setItem('nook_user', JSON.stringify(user));
  }

  function clearSession() {
    state.token = null;
    state.user = null;
    localStorage.removeItem('nook_token');
    localStorage.removeItem('nook_user');
  }

  // ---------- Auth screen ----------
  function initAuthTabs() {
    $$('.auth-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('.auth-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        $('#login-form').classList.toggle('hidden', target !== 'login');
        $('#register-form').classList.toggle('hidden', target !== 'register');
      });
    });
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#login-error');
    errEl.textContent = '';
    try {
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: {
          username: $('#login-username').value.trim(),
          password: $('#login-password').value,
        },
      });
      setSession(token, user);
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#register-error');
    errEl.textContent = '';
    try {
      const { token, user } = await api('/auth/register', {
        method: 'POST',
        body: {
          username: $('#register-username').value.trim(),
          email: $('#register-email').value.trim(),
          password: $('#register-password').value,
        },
      });
      setSession(token, user);
      enterApp();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  // ---------- Navigation ----------
  $$('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      if (view === 'profile') {
        openProfile(state.user.id);
      } else {
        state.view = view;
        state.viewingUserId = null;
        switchView('feed');
        $('#main-title').textContent = view === 'everyone' ? 'Everyone' : 'Your feed';
        loadFeed(view === 'everyone');
      }
    });
  });

  function switchView(view) {
    $('#feed-view').classList.toggle('hidden', view !== 'feed');
    $('#profile-view').classList.toggle('hidden', view !== 'profile');
    $('#search-results').classList.add('hidden');
  }

  // ---------- Composer ----------
  const composerInput = $('#composer-input');
  composerInput.addEventListener('input', () => {
    $('#char-count').textContent = `${2000 - composerInput.value.length} left`;
  });

  $('#composer-submit').addEventListener('click', async () => {
    const content = composerInput.value.trim();
    if (!content) return;
    try {
      await api('/posts', { method: 'POST', body: { content } });
      composerInput.value = '';
      $('#char-count').textContent = '2000 left';
      showToast('Posted');
      if (state.view === 'feed' && !state.viewingUserId) loadFeed(false);
    } catch (err) {
      showToast(err.message);
    }
  });

  // ---------- Post rendering ----------
  function postCardHtml(post) {
    const color = post.avatar_color || '#0F6B5C';
    const mine = state.user && post.user_id === state.user.id;
    return `
      <article class="post-card" style="--tab-color:${color}" data-post-id="${post.id}">
        <div class="post-head">
          <div class="avatar" style="background:${color}">${initials(post.username)}</div>
          <div class="post-meta">
            <span class="post-username" data-user-id="${post.user_id}">${escapeHtml(post.username)}</span>
            <span class="post-time">${timeAgo(post.created_at)}</span>
          </div>
        </div>
        <p class="post-content">${escapeHtml(post.content)}</p>
        <div class="post-actions">
          <button class="action-btn like-btn ${post.liked_by_me ? 'liked' : ''}" data-post-id="${post.id}">
            <span class="heart">${post.liked_by_me ? '♥' : '♡'}</span> <span class="like-count">${post.likes_count}</span>
          </button>
          <button class="action-btn comment-btn" data-post-id="${post.id}">💬 ${post.comments_count}</button>
          ${mine ? `<button class="action-btn delete" data-post-id="${post.id}">Delete</button>` : ''}
        </div>
      </article>
    `;
  }

  function emptyState(mark, text) {
    return `<div class="empty-state"><div class="empty-mark">${mark}</div><p>${text}</p></div>`;
  }

  function renderPosts(container, posts, emptyMark, emptyText) {
    if (!posts.length) {
      container.innerHTML = emptyState(emptyMark, emptyText);
      return;
    }
    container.innerHTML = posts.map(postCardHtml).join('');
  }

  async function loadFeed(all) {
    const list = $('#feed-list');
    list.innerHTML = '<p class="post-time">Loading…</p>';
    try {
      const { posts } = await api(`/posts${all ? '?all=1' : ''}`);
      renderPosts(list, posts, '◇', all
        ? 'No entries yet. Be the first to post something.'
        : 'Your feed is quiet. Follow people from "Everyone" to see their entries here.');
    } catch (err) {
      list.innerHTML = emptyState('!', err.message);
    }
  }

  // ---------- Delegated post actions ----------
  document.addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    const deleteBtn = e.target.closest('.action-btn.delete');
    const commentBtn = e.target.closest('.comment-btn');
    const usernameEl = e.target.closest('.post-username');
    const followBtn = e.target.closest('.follow-btn');
    const userRowName = e.target.closest('.user-row-name, .search-result-name');

    if (likeBtn) {
      const postId = likeBtn.dataset.postId;
      const liked = likeBtn.classList.contains('liked');
      try {
        const res = await api(`/posts/${postId}/like`, { method: liked ? 'DELETE' : 'POST' });
        likeBtn.classList.toggle('liked', res.liked);
        likeBtn.querySelector('.heart').textContent = res.liked ? '♥' : '♡';
        likeBtn.querySelector('.like-count').textContent = res.likes_count;
      } catch (err) { showToast(err.message); }
    }

    if (deleteBtn) {
      const postId = deleteBtn.dataset.postId;
      if (!confirm('Delete this entry?')) return;
      try {
        await api(`/posts/${postId}`, { method: 'DELETE' });
        deleteBtn.closest('.post-card').remove();
        showToast('Deleted');
      } catch (err) { showToast(err.message); }
    }

    if (commentBtn) openComments(commentBtn.dataset.postId);

    if (usernameEl) openProfile(Number(usernameEl.dataset.userId));

    if (userRowName) openProfile(Number(userRowName.dataset.userId));

    if (followBtn) {
      const userId = followBtn.dataset.userId;
      const following = followBtn.classList.contains('following');
      try {
        const res = await api(`/users/${userId}/follow`, { method: following ? 'DELETE' : 'POST' });
        followBtn.classList.toggle('following', res.following);
        followBtn.textContent = res.following ? 'Following' : 'Follow';
      } catch (err) { showToast(err.message); }
    }
  });

  // ---------- Profile ----------
  async function openProfile(userId) {
    $$('.nav-item').forEach((b) => b.classList.remove('active'));
    if (state.user && userId === state.user.id) {
      $$('.nav-item').forEach((b) => { if (b.dataset.view === 'profile') b.classList.add('active'); });
    }
    state.view = 'profile';
    state.viewingUserId = userId;
    state.profileTab = 'posts';
    switchView('profile');
    $('#main-title').textContent = 'Profile';

    try {
      const { user } = await api(`/users/${userId}`);
      renderProfileHeader(user);
      resetProfileTabs();
      loadProfilePosts(userId);
    } catch (err) {
      showToast(err.message);
    }
  }

  function renderProfileHeader(user) {
    const isMe = state.user && user.id === state.user.id;
    $('#profile-header').innerHTML = `
      <div class="profile-avatar" style="background:${user.avatar_color}">${initials(user.username)}</div>
      <div class="profile-info">
        <h3>${escapeHtml(user.username)}</h3>
        <p class="profile-bio">${user.bio ? escapeHtml(user.bio) : 'No bio yet.'}</p>
        <div class="profile-stats">
          <span><b>${user.posts_count}</b> entries</span>
          <span><b>${user.followers_count}</b> followers</span>
          <span><b>${user.following_count}</b> following</span>
        </div>
      </div>
      ${isMe
        ? `<button class="btn btn-ghost btn-small" id="edit-bio-btn">Edit bio</button>`
        : `<button class="btn ${user.is_following ? 'btn-ghost following' : 'btn-primary'} btn-small follow-btn" data-user-id="${user.id}">${user.is_following ? 'Following' : 'Follow'}</button>`
      }
    `;
    if (isMe) {
      $('#edit-bio-btn').addEventListener('click', async () => {
        const bio = prompt('Update your bio', user.bio || '');
        if (bio === null) return;
        try {
          await api(`/users/${user.id}`, { method: 'PUT', body: { bio } });
          openProfile(user.id);
        } catch (err) { showToast(err.message); }
      });
    }
  }

  function resetProfileTabs() {
    $$('.profile-tab').forEach((t) => t.classList.toggle('active', t.dataset.ptab === 'posts'));
    $('#profile-posts').classList.remove('hidden');
    $('#profile-followers').classList.add('hidden');
    $('#profile-following').classList.add('hidden');
  }

  $$('.profile-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.profile-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.ptab;
      state.profileTab = tabName;
      $('#profile-posts').classList.toggle('hidden', tabName !== 'posts');
      $('#profile-followers').classList.toggle('hidden', tabName !== 'followers');
      $('#profile-following').classList.toggle('hidden', tabName !== 'following');
      if (tabName === 'posts') loadProfilePosts(state.viewingUserId);
      if (tabName === 'followers') loadUserList('followers');
      if (tabName === 'following') loadUserList('following');
    });
  });

  async function loadProfilePosts(userId) {
    const container = $('#profile-posts');
    container.innerHTML = '<p class="post-time">Loading…</p>';
    try {
      const { posts } = await api(`/users/${userId}/posts`);
      renderPosts(container, posts, '◇', 'No entries yet.');
    } catch (err) {
      container.innerHTML = emptyState('!', err.message);
    }
  }

  function userRowHtml(user) {
    const isMe = state.user && user.id === state.user.id;
    return `
      <div class="user-row">
        <div class="avatar" style="background:${user.avatar_color}">${initials(user.username)}</div>
        <div class="user-row-info">
          <span class="user-row-name" data-user-id="${user.id}">${escapeHtml(user.username)}</span>
          <span class="user-row-bio">${user.bio ? escapeHtml(user.bio) : `${user.followers_count} followers`}</span>
        </div>
        ${isMe ? '' : `<button class="btn ${user.is_following ? 'btn-ghost following' : 'btn-primary'} btn-small follow-btn" data-user-id="${user.id}">${user.is_following ? 'Following' : 'Follow'}</button>`}
      </div>
    `;
  }

  async function loadUserList(type) {
    const container = $(`#profile-${type}`);
    container.innerHTML = '<p class="post-time">Loading…</p>';
    try {
      const { users } = await api(`/users/${state.viewingUserId}/${type}`);
      if (!users.length) {
        container.innerHTML = emptyState('◇', `No ${type} yet.`);
        return;
      }
      container.innerHTML = users.map(userRowHtml).join('');
    } catch (err) {
      container.innerHTML = emptyState('!', err.message);
    }
  }

  // ---------- Search ----------
  let searchTimer;
  $('#user-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) {
      $('#search-results').classList.add('hidden');
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const { users } = await api(`/users?q=${encodeURIComponent(q)}`);
        const box = $('#search-results');
        if (!users.length) {
          box.innerHTML = `<div class="search-result-row"><span class="user-row-bio">No people found.</span></div>`;
        } else {
          box.innerHTML = users.map((u) => `
            <div class="search-result-row">
              <div class="avatar" style="background:${u.avatar_color}">${initials(u.username)}</div>
              <div class="user-row-info">
                <span class="search-result-name user-row-name" data-user-id="${u.id}">${escapeHtml(u.username)}</span>
                <span class="user-row-bio">${u.followers_count} followers</span>
              </div>
            </div>
          `).join('');
        }
        box.classList.remove('hidden');
      } catch (err) { /* ignore */ }
    }, 250);
  });

  // ---------- Comment drawer ----------
  let activePostId = null;

  async function openComments(postId) {
    activePostId = postId;
    $('#comment-overlay').classList.remove('hidden');
    $('#drawer-post').innerHTML = '<p class="post-time">Loading…</p>';
    $('#drawer-comments').innerHTML = '';
    try {
      const { post } = await api(`/posts/${postId}`);
      $('#drawer-post').innerHTML = postCardHtml(post);
      loadComments(postId);
    } catch (err) { showToast(err.message); }
  }

  async function loadComments(postId) {
    const container = $('#drawer-comments');
    try {
      const { comments } = await api(`/posts/${postId}/comments`);
      if (!comments.length) {
        container.innerHTML = emptyState('◇', 'No replies yet.');
        return;
      }
      container.innerHTML = comments.map((c) => `
        <div class="comment-row" data-comment-id="${c.id}">
          <div class="post-head">
            <div class="avatar" style="background:${c.avatar_color}">${initials(c.username)}</div>
            <div class="post-meta">
              <span class="post-username" data-user-id="${c.user_id}">${escapeHtml(c.username)}</span>
              <span class="post-time">${timeAgo(c.created_at)}</span>
            </div>
            ${state.user && c.user_id === state.user.id ? `<button class="btn-icon delete-comment" data-comment-id="${c.id}" style="margin-left:auto">✕</button>` : ''}
          </div>
          <p class="post-content">${escapeHtml(c.content)}</p>
        </div>
      `).join('');
    } catch (err) {
      container.innerHTML = emptyState('!', err.message);
    }
  }

  document.addEventListener('click', async (e) => {
    const delComment = e.target.closest('.delete-comment');
    if (delComment) {
      try {
        await api(`/comments/${delComment.dataset.commentId}`, { method: 'DELETE' });
        delComment.closest('.comment-row').remove();
      } catch (err) { showToast(err.message); }
    }
  });

  $('#close-drawer').addEventListener('click', () => {
    $('#comment-overlay').classList.add('hidden');
    activePostId = null;
    // refresh whichever list is visible so comment counts stay accurate
    if (state.view === 'feed') loadFeed(state.viewingUserId === null && $('#main-title').textContent === 'Everyone');
    else if (state.viewingUserId) loadProfilePosts(state.viewingUserId);
  });

  $('#comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#comment-input');
    const content = input.value.trim();
    if (!content || !activePostId) return;
    try {
      await api(`/posts/${activePostId}/comments`, { method: 'POST', body: { content } });
      input.value = '';
      loadComments(activePostId);
    } catch (err) { showToast(err.message); }
  });

  // ---------- Boot ----------
  function enterApp() {
    $('#auth-screen').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#feed-list') && loadFeed(false);
  }

  initAuthTabs();
  if (state.token && state.user) {
    enterApp();
  }
})();
