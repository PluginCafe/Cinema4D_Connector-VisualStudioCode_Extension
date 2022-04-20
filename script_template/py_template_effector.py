"""

Attributes:
    op (c4d.BaseObject): The Python effector.
    gen (c4d.BaseObject): The MoGraph generator evaluating the effector.
    doc (c4d.documents.BaseDocument): The document #gen and #op are part of.
    thread (c4d.threading.BaseThread): The thread this module is running in.
"""
import c4d
import typing

op: c4d.BaseObject
gen: c4d.BaseObject
doc: c4d.documents.BaseDocument
thread: c4d.threading.BaseThread

def main() -> typing.Union[c4d.Vector, float, int]:
    """Called by Cinema 4D to evaluate the effector.
    """
    return 1.0