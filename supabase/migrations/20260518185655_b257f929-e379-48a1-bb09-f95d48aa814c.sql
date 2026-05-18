CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;