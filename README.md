# Negas-tattoo
forms negas tattoo
# Negas Tattoo

## Keep-alive para Supabase

Para evitar la pausa por inactividad en Supabase, configura un monitor externo como UptimeRobot para llamar a:

`GET /api/keepalive`

Ese endpoint ejecuta consultas reales contra Supabase usando `SUPABASE_SERVICE_ROLE_KEY`, así que:

- no debe exponerse en el frontend
- debe existir en las variables de entorno del servidor
- el monitor debe pegarle a esta URL, no a la home

## Variables nuevas

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Ejemplo de monitor

Punto de entrada recomendado:

`https://tu-dominio.com/api/keepalive`
