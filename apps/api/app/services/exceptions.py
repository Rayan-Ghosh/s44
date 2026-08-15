"""Domain-level errors, translated to HTTP status codes at the router
layer (app/api/routers). Kept out of the repository layer, which should
stay a thin, exception-free CRUD surface."""


class DomainError(Exception):
    """Base class for errors routers know how to translate."""


class UserAlreadyExistsError(DomainError):
    pass


class UserNotFoundError(DomainError):
    pass


class TransactionNotFoundError(DomainError):
    pass
