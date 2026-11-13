-- Apaga a create_order antiga (12 parâmetros). Desde a 0028 o site chama só a versão de 14 parâmetros
-- (chave de idempotência + troco); a antiga ficou apenas para o código anterior continuar funcionando até o deploy.
DROP FUNCTION IF EXISTS create_order(uuid, text, text, order_type, text, payment_method, text, jsonb, text, boolean, uuid, numeric);
