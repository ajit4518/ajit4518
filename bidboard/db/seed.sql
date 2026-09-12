INSERT INTO categories (slug, name, sort_order) VALUES
  ('social-agencies',  'Social media agencies', 1),
  ('seo-content',      'SEO & content agencies', 2),
  ('paid-ads',         'Paid ads agencies',      3),
  ('video-ugc',        'Video & UGC studios',    4),
  ('newsletters',      'Newsletter operators',   5),
  ('courses',          'Course & cohort creators', 6)
ON CONFLICT (slug) DO NOTHING;
