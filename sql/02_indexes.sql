CREATE UNIQUE INDEX idx_active_contract_freelancer
ON contracts (freelancer_id)
WHERE status = 'IN_PROGRESS';
