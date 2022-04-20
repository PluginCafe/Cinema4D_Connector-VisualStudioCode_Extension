"""

Attributes:
    doc (c4d.documents.BaseDocument): The document the Python field is attached to.
"""

import c4d
from c4d.modules import mograph

doc: c4d.documents.BaseDocument

def Sample(op: mograph.FieldObject, inputs: mograph.FieldInput, outputs: mograph.FieldOutput,
           info: mograph.FieldInfo) -> bool:
    """Called by Cinema 4D to sample the field.

    Args:
        op: The Python field object that is being sampled.
        inputs: The points that have been requested to be sampled.
        outputs: The field arrays to write the sample results to.
        info: The sampling context.
    
    Returns:
        The success of the sampling.
    """    
    return True

'''
def InitSampling(op: mograph.FieldObject, info: mograph.FieldInfo) -> bool:
    """Called by Cinema 4D to initialize a field for a sampling pass.

    Args:
        op: The Python field object that is going to be sampled.
        info: The sampling context.
    
    Returns:
        Return #False to prevent the field from being sampled, return #True otherwise.
    """   
    return True


def FreeSampling(op: c4d.modules.mograph.FieldObject,  # The Python field object
    info: c4d.modules.mograph.FieldInfo) -> bool:  # The sampling context
    # Cleanup sampling data.
    """Called by Cinema 4D after a field has been sampled.

    Args:
        op: The Python field object that has been sampled.
        info: The sampling context.
    
    Returns:
        Return #False to indicate that the freeing of resources failed, return #True otherwise.
    """  
    return True
'''