# Bigote & Navaja Barber Club

Servicios de alta gama para caballeros exigentes en El Poblado, Medellín

## Qué tiene la página

- Servicios con precio
- Horarios
- Cómo funciona
- Opiniones de clientes
- Preguntas frecuentes
- Contacto (WhatsApp, teléfono, correo, mapa)

## El formulario de contacto

Funciona de verdad: cada mensaje se guarda en el servidor de la página
(`POST /api/contacto`, base SQLite en `data/contacto.db`).

Para leerlos, define la variable de entorno `CLAVE_ADMIN` en tu servidor y pide:

```
curl -H "X-Clave-Admin: TU_CLAVE" https://tu-pagina/api/mensajes
```

Si el envío falla, la página ofrece WhatsApp o correo con el mensaje ya escrito.

## Antes de publicarla

Revisa el número de WhatsApp, el teléfono, el correo y la dirección: son los
que el visitante va a usar para escribirte. Están en `index.html`.

Hecha con Meta-Agente: HTML/CSS/JS sin dependencias externas, con la librería
gráfica DIXEL dentro del proyecto (carpeta `vendor/`).

## Reservas en línea (`/reservar`)

Asistente de 4 pasos: servicio → profesional → fecha y hora → datos. Los
horarios libres los calcula el servidor con `backend/negocio.json` (servicios
con duración, profesionales, días y horas de atención): edítalo para ajustar
tu agenda. Dos personas no pueden quedarse con la misma hora.

Variables de entorno (todas opcionales; sin ellas la reserva funciona igual):

| Variable | Para qué |
|---|---|
| `GOOGLE_CLIENT_ID` | Botón «Continuar con Google» (autoriza el dominio de la página en Google Cloud) |
| `SMTP_USER` / `SMTP_PASSWORD` | Correos de confirmación por Gmail (contraseña de aplicación) |
| `NOTIFICAR_A` | Correo del dueño que recibe cada reserva (por defecto, el de contacto) |
| `CLAVE_ADMIN` | Ver la agenda: `GET /api/reservas` con la cabecera `X-Clave-Admin` |
| `ZONA_HORARIA_HORAS` | Desfase horario (por defecto -5, Colombia) |
