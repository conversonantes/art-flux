/** The user is not allowed to do this action (core-level permission, not RLS). */
export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para hacer esto") {
    super(message);
    this.name = "ForbiddenError";
  }
}
