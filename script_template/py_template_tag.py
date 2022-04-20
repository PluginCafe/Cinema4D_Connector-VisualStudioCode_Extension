"""

Attributes:
    doc: The document in which the tag is contained.
    op: The Python scripting tag which holds this script.
    flags: Set to one of the EXECUTIONFLAGS, indicating in which state of scene execution the 
     document is when the tag is being executed. The value can be a combination of the values
     in EXECUTIONFLAGS.
    priority: The execution priority of the Python scripting tag as seen in the Attribute Manager.
    tp: The Thinking Particles particle system of #doc.
    thread: The thread in which this tag is being executed.
"""
import c4d
import typing

doc: c4d.documents.BaseDocument 
op: c4d.BaseTag
flags: int
priority: int
tp: typing.Optional[c4d.modules.thinkingparticles.TP_MasterSystem]
thread: typing.Optional[c4d.threading.BaseThread]

def main() -> None:
    """Called by Cinema 4D to excute the tag.
    """
    pass

'''
def message(id: int, data: typing.Optional[object]) -> bool:
    """Called by Cinema 4D to propagate messages to the tag.

    Args:
        id: The identifier for the message.
        data: The data accompanying the message. Can be #None.

    Returns:
        Depends on the message type that has been sent.
    """
    return super().Message(id, data)


def draw(bd: c4d.BaseDraw) -> bool:
    """Called by Cinema 4D to allow for drawing operations in viewports.

    Args:
        bd: A vieport to draw into.

    Returns:
        If the drawing operation has been successful.
    """
    return True
'''