-- Q10 перейменування користувача (в реляційній моделі — один рядок; пости й коментарі посилаються на user_id)
UPDATE users SET username = 'taras_renamed' WHERE user_id = 13;
