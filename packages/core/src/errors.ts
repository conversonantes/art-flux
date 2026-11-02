/** The user is not allowed to do this action (core-level permission, not RLS). */
export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para hacer esto") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Something does not exist, or is not visible to this user (the two look the same on purpose). */
export class NotFoundError extends Error {
  constructor(message = "No encontramos lo que buscas") {
    super(message);
    this.name = "NotFoundError";
  }
}
