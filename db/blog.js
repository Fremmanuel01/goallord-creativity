const supabase = require('../lib/supabase');
const { clean } = require('../lib/utils');

const POSTS = 'blog_posts';
const COMMENTS = 'blog_comments';

module.exports = {
  // ---- Posts ----
  async findPosts({ filter = {}, excludeContent, sort, page, limit, featured } = {}) {
    const select = excludeContent
      ? 'id, slug, title, excerpt, cover_image, category, tags, author, author_avatar, read_time, featured, published, published_at, views, has_affiliate, affiliate_cta, reactions, created_at, updated_at'
      : '*';
    let q = supabase.from(POSTS).select(select, { count: 'exact' });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    if (featured !== undefined) q = q.eq('featured', featured);
    if (sort) {
      const desc = sort.startsWith('-');
      const col = desc ? sort.slice(1) : sort;
      q = q.order(col, { ascending: !desc });
    } else {
      q = q.order('published_at', { ascending: false });
    }
    if (page && limit) {
      const from = (Number(page) - 1) * Number(limit);
      const to = from + Number(limit) - 1;
      q = q.range(from, to);
    }
    const { data, error, count } = await q;
    if (error) throw error;
    return { data: data || [], count };
  },

  async findPostBySlug(slug) {
    const { data, error } = await supabase.from(POSTS).select('*').eq('slug', slug).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findPostById(id) {
    const { data, error } = await supabase.from(POSTS).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async findFeaturedPost() {
    const select = 'id, slug, title, excerpt, cover_image, category, tags, author, author_avatar, read_time, featured, published, published_at, views, has_affiliate, affiliate_cta, reactions, created_at, updated_at';
    const { data, error } = await supabase.from(POSTS).select(select).eq('published', true).eq('featured', true).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async findAdjacentPost(publishedAt, direction) {
    let q = supabase.from(POSTS).select('slug, title').eq('published', true);
    if (direction === 'prev') {
      q = q.lt('published_at', publishedAt).order('published_at', { ascending: false });
    } else {
      q = q.gt('published_at', publishedAt).order('published_at', { ascending: true });
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw error;
    return data;
  },

  async createPost(doc) {
    const { data, error } = await supabase.from(POSTS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async updatePostBySlug(slug, updates) {
    const { data, error } = await supabase.from(POSTS).update(updates).eq('slug', slug).select().single();
    if (error) throw error;
    return data;
  },

  async deletePostBySlug(slug) {
    const { error } = await supabase.from(POSTS).delete().eq('slug', slug);
    if (error) throw error;
  },

  async incrementViews(postId) {
    await supabase.rpc('increment_blog_views', { post_id: postId });
  },

  async incrementReaction(slug, emoji) {
    const { data, error } = await supabase.rpc('increment_blog_reaction', { p_slug: slug, p_emoji: emoji });
    if (error) throw error;
    return data;
  },

  async insertManyPosts(posts) {
    const results = [];
    for (const post of posts) {
      const { data, error } = await supabase.from(POSTS).insert(clean(post)).select().single();
      if (error) throw error;
      results.push(data);
    }
    return results;
  },

  async countPosts(filter = {}) {
    let q = supabase.from(POSTS).select('id', { count: 'exact', head: true });
    for (const [key, val] of Object.entries(filter)) {
      q = q.eq(key, val);
    }
    const { count, error } = await q;
    if (error) throw error;
    return count || 0;
  },

  async findAllSlugs() {
    const { data, error } = await supabase.from(POSTS).select('slug, updated_at').eq('published', true);
    if (error) throw error;
    return data || [];
  },

  // ---- Comments ----
  async findComments(postId, approved = true) {
    let q = supabase.from(COMMENTS).select('*').eq('post_id', postId);
    if (approved !== null) q = q.eq('approved', approved);
    q = q.order('created_at', { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },

  async createComment(doc) {
    const { data, error } = await supabase.from(COMMENTS).insert(clean(doc)).select().single();
    if (error) throw error;
    return data;
  },

  async deleteComment(id) {
    const { error } = await supabase.from(COMMENTS).delete().eq('id', id);
    if (error) throw error;
  }
};
