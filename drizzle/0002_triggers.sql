-- do_not_contact: bloqueia criação de negociações e lembretes para leads marcados.
CREATE FUNCTION lacus_block_do_not_contact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM leads WHERE id = NEW.lead_id AND do_not_contact) THEN
    RAISE EXCEPTION 'LEAD_DO_NOT_CONTACT';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER trg_deals_do_not_contact BEFORE INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION lacus_block_do_not_contact();--> statement-breakpoint
-- Prefixos 1_/2_ garantem a ordem: lead_id é forçado antes da checagem de do_not_contact.
CREATE FUNCTION lacus_reminder_lead_from_deal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deal_id IS NOT NULL THEN
    SELECT lead_id INTO NEW.lead_id FROM deals WHERE id = NEW.deal_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'REMINDER_DEAL_NOT_FOUND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER trg_reminders_1_lead_from_deal BEFORE INSERT OR UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION lacus_reminder_lead_from_deal();--> statement-breakpoint
CREATE TRIGGER trg_reminders_2_do_not_contact BEFORE INSERT ON reminders
  FOR EACH ROW EXECUTE FUNCTION lacus_block_do_not_contact();--> statement-breakpoint
-- updated_at automático
CREATE FUNCTION lacus_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER trg_niches_updated_at BEFORE UPDATE ON niches FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_deals_updated_at BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_reminders_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_google_connections_updated_at BEFORE UPDATE ON google_connections FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();--> statement-breakpoint
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION lacus_touch_updated_at();
