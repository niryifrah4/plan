-- Delete investment data for household 27c9d83e-3abd-4e09-8924-357993db51da

DELETE FROM client_state 
WHERE household_id = '27c9d83e-3abd-4e09-8924-357993db51da'
  AND state_key IN ('portfolio_positions', 'portfolio_accounts');

DELETE FROM investment_reports 
WHERE household_id = '27c9d83e-3abd-4e09-8924-357993db51da';
