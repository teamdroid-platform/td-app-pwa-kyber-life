-- Ni las cuentas ni las tarjetas tienen nombre.
--
-- Se reconocen por su número, y el nombre era una etiqueta que había que
-- inventar y mantener: los que salían solos —«Cuenta ••••10»— no decían nada
-- que el número no dijera ya, y puestos al lado lo repetían.
--
-- Lo que se muestra se compone al leer, del tipo y el número («Ahorros
-- ••••10») o de la marca en una tarjeta («Visa XXXX2780»), así que nunca queda
-- desfasado respecto a los datos. Las instituciones sí conservan el suyo: ahí
-- el nombre es el dato.
--
-- Irreversible. Se comprobó antes de aplicarla que las dos únicas filas
-- existentes tenían nombres generados por la propia app, sin nada escrito a
-- mano que perder.

ALTER TABLE public.bank_accounts DROP COLUMN name;
ALTER TABLE public.bank_cards DROP COLUMN name;
