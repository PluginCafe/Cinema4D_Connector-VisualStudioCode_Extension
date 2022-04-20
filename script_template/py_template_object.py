"""

Attributes:
    doc (c4d.documents.BaseDocument): The document the Python field is attached to.
    op (c4d.BaseObject): The Python Generator object.
"""

import c4d
import typing

doc: c4d.documents.BaseDocument
op: c4d.BaseObject

def main() -> c4d.BaseObject:
    """Called by Cinema 4D to retrieve the cache for the Python Generator object.

    Returns:
        The BaseObject hierarchy that is gooing to be the cache of the generator.
    """
    return c4d.BaseObject(c4d.Ocube)

'''
def message(id: int, data: typing.Optional[object]) -> bool:
    """Called by Cinema 4D to propagate messages to the object.

    Args:
        id: The identifier for the message.
        data: The data accompanying the message. Can be #None.

    Returns:
        Depends on the message type that has been sent.
    """
    return super().Message(id, data)
'''