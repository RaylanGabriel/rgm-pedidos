-- Remove a versão antiga de create_order (sem taxa de entrega). O site usa a versão com p_delivery_zone_id (0006).
DROP FUNCTION IF EXISTS create_order(uuid, text, text, order_type, text, payment_method, text, jsonb, text, boolean);
