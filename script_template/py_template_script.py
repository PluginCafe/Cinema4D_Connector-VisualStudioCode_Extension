"""

Attributes:
    doc (c4d.documents.BaseDocument): The currently active document.
    op (c4d.BaseObject): The primary selected object in #doc. Cinema 4D can hold multiple objects
     selected, and then only the first object in that selection is reflected in #op. Can be #None. 
"""

import c4d
import typing

doc: c4d.documents.BaseDocument
op: typing.Optional[c4d.BaseObject]

def main() -> None:
    """
    """
    pass

'''
def state():
    """Called by Cinema 4D to evaluate the icon state of the script.

    A disabled script cannot be executed by the user.

    Returns:
        The icon state the script should take. Return:
            * 0: For the icon to be disabled.
            * CMD_ENABLED: For the icon to be enabled.
            * CMD_ENABLED | CMD_VALUE: For the icon to be enabled and highlighted. This is usually
              used to indicate a toggle state, i.e., if something is on or off.
    """
    return c4d.CMD_ENABLED
'''

if __name__ == '__main__':
    # When the script is invoked, Cinema 4D will execute the file with the __main__ context.
    main()
