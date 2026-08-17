-- El tipo de institución lo declara el usuario, no lo adivina la base.
--
-- El DEFAULT era 'BANK', así que cualquier INSERT que omitiera la columna
-- afirmaba "esto es un banco" sin que nadie lo hubiera dicho — y PACIFICARD
-- o una mutualista quedaban clasificadas mal desde el nacimiento. 'OTHER' es
-- genérico: no afirma nada y deja la clasificación al usuario.
--
-- Solo cambia el valor por defecto de INSERT futuros; las filas existentes
-- conservan el kind que ya tienen.

ALTER TABLE public.bank_institutions
    ALTER COLUMN kind SET DEFAULT 'OTHER'::bank_institution_kind;
