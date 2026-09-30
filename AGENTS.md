# parrot-agent

Toda la documentación del proyecto está en [CLAUDE.md](./CLAUDE.md): estructura,
comandos de desarrollo, cómo cambiar horario/canal/proyecto, y la regla
permanente de cero secretos en el repo. Léela antes de tocar código.

Dos cosas que no se negocian:

1. **Este proyecto usa eve, que está en beta y cuya API cambia.** No escribas
   código de eve de memoria. Los docs de la versión exacta que está instalada
   están en `node_modules/eve/docs/`; si algo no está ahí, usa
   https://eve.dev/docs.
2. **Ningún secreto ni ID interno entra al repositorio.** Corre
   `npm run check:secretos` antes de cada push.
