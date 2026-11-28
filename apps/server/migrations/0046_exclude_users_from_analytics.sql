ALTER TABLE users ADD COLUMN excluded_from_analytics boolean NOT NULL DEFAULT false;

CREATE VIEW analytics_users AS
SELECT id, created_at FROM users WHERE NOT excluded_from_analytics;

CREATE VIEW analytics_activity AS
SELECT e.* FROM product_activity e JOIN analytics_users u ON u.id = e.user_id;
