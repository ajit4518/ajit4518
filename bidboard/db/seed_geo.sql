INSERT INTO countries (code, name, slug) VALUES
  ('IN','India','india'),
  ('US','United States','united-states'),
  ('GB','United Kingdom','united-kingdom'),
  ('AE','United Arab Emirates','united-arab-emirates'),
  ('SG','Singapore','singapore'),
  ('AU','Australia','australia'),
  ('CA','Canada','canada'),
  ('DE','Germany','germany')
ON CONFLICT (code) DO NOTHING;

INSERT INTO cities (country_code, name, slug, sort_order) VALUES
  ('IN','Mumbai','mumbai',1),
  ('IN','Delhi','delhi',2),
  ('IN','Bengaluru','bengaluru',3),
  ('IN','Hyderabad','hyderabad',4),
  ('IN','Pune','pune',5),
  ('IN','Chennai','chennai',6),
  ('IN','Ahmedabad','ahmedabad',7),
  ('IN','Kolkata','kolkata',8),
  ('US','New York','new-york',1),
  ('US','Los Angeles','los-angeles',2),
  ('US','San Francisco','san-francisco',3),
  ('US','Chicago','chicago',4),
  ('US','Austin','austin',5),
  ('US','Miami','miami',6),
  ('GB','London','london',1),
  ('GB','Manchester','manchester',2),
  ('AE','Dubai','dubai',1),
  ('AE','Abu Dhabi','abu-dhabi',2),
  ('SG','Singapore','singapore',1),
  ('AU','Sydney','sydney',1),
  ('AU','Melbourne','melbourne',2),
  ('CA','Toronto','toronto',1),
  ('CA','Vancouver','vancouver',2),
  ('DE','Berlin','berlin',1),
  ('DE','Munich','munich',2)
ON CONFLICT (country_code, slug) DO NOTHING;
