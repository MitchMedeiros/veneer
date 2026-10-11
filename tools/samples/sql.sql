-- line comment
/* block
   comment */
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'anon',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

SELECT u.id, COUNT(*) AS total, "quoted col"
FROM users u
LEFT JOIN orders o ON o.user_id = u.id AND o.total > 10.5
WHERE u.name LIKE '%it''s%' AND u.id IN (1, 2, 3) OR u.deleted IS NULL
GROUP BY u.id
HAVING COUNT(*) > 1
ORDER BY total DESC
LIMIT 10 OFFSET 5;

INSERT INTO users (name) VALUES ('a'), ('b');
UPDATE users SET name = 'x' WHERE id = 1;
DELETE FROM users WHERE id = 2;
