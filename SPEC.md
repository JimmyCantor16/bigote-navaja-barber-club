# Especificación y plan

## Qué se construye
Landing page y sistema de reservas online para la barbería premium «Bigote & Navaja Barber Club»

## Pantallas que verás
- Inicio
- Listado de Servicios
- Detalle de Servicio
- Selección de Barbero
- Calendario y Horarios Disponibles
- Formulario de Reserva
- Confirmación de Reserva
- Error y Estado Vacío

## Datos del sistema
- Servicio
- Barbero
- Horario
- Reserva
- Cliente

## API del backend
- GET /api/servicios
- GET /api/barberos
- GET /api/horarios?barberoId={id}&fecha={yyyy-MM-dd}
- POST /api/reservas
- GET /api/reservas/{id}

## Para considerarlo funcional, debes VER
- Tarjetas con nombre, duración y precio de cada servicio en la pantalla de Listado de Servicios
- Lista de barberos con foto y nombre en la pantalla de Selección de Barbero
- Calendario que muestra los días laborables (lunes‑sábado) y franjas horarias libres en la pantalla de Calendario y Horarios Disponibles
- Formulario con selects para servicio, barbero, día y hora, y botón de confirmar en la pantalla de Formulario de Reserva
- Pantalla de Confirmación que muestra resumen de la reserva (servicio, barbero, fecha, hora, precio) y número de confirmación
- Mensaje amigable cuando no hay horarios disponibles para la combinación elegida
- Mensaje de error claro si la reserva falla o la API no responde

## Stack
Frontend con React/Next.js y Tailwind CSS; Backend con Node.js + Express; Base de datos PostgreSQL; despliegue en Vercel o similar
