CREATE OR REPLACE FUNCTION enforce_universe_fields()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_universe = TRUE THEN
        NEW.appearance := NULL;
        NEW.personality := NULL;
        NEW.backstory := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_universe_fields ON characters;

CREATE TRIGGER trigger_enforce_universe_fields
BEFORE INSERT OR UPDATE ON characters
FOR EACH ROW
EXECUTE FUNCTION enforce_universe_fields();
