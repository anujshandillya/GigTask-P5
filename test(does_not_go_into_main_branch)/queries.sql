CALL fund_gig(
	'e7b3d1e9-2b83-432a-9f1e-9be7f0cead5b',  -- Client UUID
    'b7a4d780-92f5-4539-9a24-aa0da8721553',  -- Freelancer UUID
    46218468.00                                    -- Budget
);


SELECT * FROM clients;
SELECT * FROM freelancers;
SELECT * FROM wallet_audit_logs WHERE client_id = 'e7b3d1e9-2b83-432a-9f1e-9be7f0cead5b';
SELECT * FROM contracts WHERE client_id = 'e7b3d1e9-2b83-432a-9f1e-9be7f0cead5b';