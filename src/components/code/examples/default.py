"""
Photonic Integrated Circuit (PIC) Example - Tunable Optical Processor

This design demonstrates a complex photonic chip with:
- 3 spiral delay lines with Mach-Zehnder Interferometers (MZIs) and integrated heaters
- 4 additional tunable MZIs for signal processing
- 4×2 MMI (multimode interferometer) for optical combining
- 8 grating couplers for fiber-to-chip coupling
- 22 bond pads for electrical control of phase shifters
- Complete electrical routing with metal traces

The chip showcases typical photonics design patterns: optical routing with Euler bends,
fan-in/fan-out structures, electrical-optical integration, and I/O interfacing.

Modify the PARAMETERS section below to customize the design.
"""

import gdsfactory as gf
import inspect
from functools import partial
from gdsfactory.component import Component
from gdsfactory.add_pins import add_pins_container


# ============================================================================
# PARAMETERS - Modify these values to customize the design
# ============================================================================

# --- Circuit Design Parameters ---
N_LOOPS_LIST = [11, 10, 9]  # Number of spiral loops for each of the 3 main circuits
MZI_LENGTH_X = 150.0  # Length of MZI arms in x direction (μm)
MZI_DEFAULT_LENGTH = 200.0  # Default length for MZI templates (μm)
HEATER_LENGTH = 100.0  # Length of vertical heater sections (μm)
SPIRAL_SPACING = 3.0  # Spacing between spiral turns (μm)

# --- Layout Parameters ---
WG_POSITIONS = [0, 300, 600]  # X positions for alignment waveguides (μm)
WG_LENGTH = 1.0  # Length of alignment waveguides (μm)
STACKED_MZI_COUNT = 4  # Number of stacked MZIs
STACKED_MZI_X_START = -280  # Starting x position for stacked MZIs (μm)
STACKED_MZI_Y_START = 280  # Starting y position for stacked MZIs (μm)
STACKED_MZI_X_SPACING_EXTRA = 10  # Extra spacing between stacked MZIs along x (μm)
SPIRAL_ROTATION = 180  # Rotation angle for spirals (degrees)
SPIRAL_Y_OFFSET = -60  # Y offset for spiral positioning (μm)

# --- Routing Parameters ---
HEATER_OFFSET_Y = 50  # Vertical offset for heater placement from ports (μm)
HEATER_OFFSET_X = 50  # Horizontal offset for heater placement from ports (μm)
FANIN_INPUT_LENGTH = 30  # Length of fan-in input waveguides (μm)
FANIN_TARGET_X = 710.0  # X position where fan-in starts (μm)
FANIN_MMI_OFFSET_X = 200  # Offset from fan-in inputs to MMI position (μm)
FANIN_OUTPUT_SPACING = 1.25  # Output spacing for fan-in (μm, matches MMI port spacing)
FANOUT_OUTPUT_SPACING = 5.0  # Output spacing for fan-out (μm)
FANOUT_OUTPUT_LENGTH = 5.0  # Length of fan-out output waveguides (μm)
FANOUT_LENGTH_X = 10.0  # Length along x for fan-out S-bend transition (μm)

# --- Grating Coupler Parameters ---
GC_ARRAY_X = 1100  # X position for grating coupler array (μm)
GC_ARRAY_Y_OFFSET = 127  # Y offset for grating coupler array (μm, one pitch)
GC_COUNT = 8  # Number of grating couplers
GC_PITCH = 127  # Pitch between grating couplers (μm, standard)
GC_ROTATION = -90  # Default rotation for grating coupler array (degrees)

# --- Bond Pad Parameters ---
EDGE_BUFFER = 500.0  # Buffer distance from pattern extent to bond pads (μm)
PAD_PITCH = 100.0  # Pitch between bond pads (μm)
PAD_SIZE = 80.0  # Bond pad size (μm × μm)
PAD_PORT_WIDTH = 40.0  # Width of bond pad electrical ports (μm)
LEFT_PAD_START_Y = -200.0  # Starting Y position for left edge pads (μm)
BOTTOM_PAD_START_X = 0.0  # Starting X position for bottom edge pads (μm)

# --- Electrical Routing Parameters ---
METAL_WIDTH = 15.0  # Width of metal traces (μm)
METAL_LAYER = (49, 0)  # Metal layer for routing (M3)
CHANNEL_SPACING_GAP = 5.0  # Gap between parallel metal traces (μm)
INTERMEDIATE_OFFSET_LEFT = 200.0  # Offset from left bond pads for routing (μm)
INTERMEDIATE_OFFSET_BOTTOM = 200.0  # Offset from bottom bond pads for routing (μm)

# ============================================================================
# COMPONENT TEMPLATES
# ============================================================================

# Create custom MZI 1x2_2x2 with phase shifter (heater in top arm)
mzi1x2_2x2_phase_shifter = partial(
    gf.components.mzi,
    combiner='mmi2x2',
    port_e1_combiner='o3',
    port_e0_combiner='o4',
    straight_x_top='straight_heater_metal',
    length_x=MZI_DEFAULT_LENGTH
)

# Create custom MZI 1x2_1x2 with phase shifter (heater in top arm)
# This has 1x2 splitter and 1x2 combiner (only one output)
mzi1x2_1x2_phase_shifter = partial(
    gf.components.mzi,
    splitter='mmi1x2',
    combiner='mmi1x2',
    straight_x_top='straight_heater_metal',
    length_x=MZI_DEFAULT_LENGTH
)


@gf.cell
def spiral_mzi_circuit(n_loops: int = 6, mzi_length_x: float = 150.0) -> Component:
    """
    Create a circuit with spiral, waveguide, and MZI with integrated heater connected together.

    Args:
        n_loops: Number of loops in the spiral
        mzi_length_x: Length of the MZI arms in x direction

    Returns:
        Component with optical ports: o1 (spiral input), o2 (MZI output 1), o3 (MZI output 2)
        and electrical ports from the MZI heater
    """
    c = gf.Component()

    # Create sub-components
    c_strip = gf.components.straight(length=WG_LENGTH, cross_section='strip')
    c_spiral = gf.components.spiral(
        length=0,
        bend='bend_euler',
        straight='straight',
        cross_section='strip',
        spacing=SPIRAL_SPACING,
        n_loops=n_loops
    )
    c_mzi = mzi1x2_2x2_phase_shifter(
        cross_section='strip',
        length_y=0.0,
        length_x=mzi_length_x,
        delta_length=0.0,
    )

    # Add references
    ref_WG = c << c_strip
    ref_spiral = c << c_spiral
    ref_spiral.rotate(SPIRAL_ROTATION).movey(SPIRAL_Y_OFFSET)
    ref_mzi = c << c_mzi

    # Connect components
    ref_mzi.connect("o2", ref_WG.ports["o2"])

    # Route from spiral o2 to waveguide o1 with Euler bends
    gf.routing.route_single(
        c,
        port1=ref_spiral.ports["o2"],
        port2=ref_WG.ports["o1"],
        cross_section='strip',
        bend='bend_euler'
    )

    # Export optical ports
    c.add_port("o1", port=ref_spiral.ports["o1"])  # Spiral input
    c.add_port("o2", port=ref_mzi.ports["o1"])     # MZI output 1
    c.add_port("o3", port=ref_mzi.ports["o3"])     # MZI output 2

    # Export electrical ports from MZI heater
    for port in ref_mzi.ports:
        if 'e' in port.name or port.port_type == 'electrical':
            c.add_port(f"mzi_{port.name}", port=port)

    return c


# ============================================================================
# MAIN CHIP ASSEMBLY
# ============================================================================

# Create the main chip component
c_chip = gf.Component("chip")

# Create three short waveguides for alignment at y=0
waveguides = []
for i, x_pos in enumerate(WG_POSITIONS):
    wg = c_chip << gf.components.straight(length=WG_LENGTH, cross_section='strip')
    wg.move((x_pos, 0))  # Position at (x_pos, 0)
    waveguides.append(wg)

# Create three spiral-MZI circuits with varying spiral sizes
circuits = []
for i, n_loops in enumerate(N_LOOPS_LIST):
    circuit = c_chip << spiral_mzi_circuit(n_loops=n_loops, mzi_length_x=MZI_LENGTH_X)
    circuits.append(circuit)

    # Connect the MZI output (circuit's o2) to the waveguide's o1
    circuit.connect("o2", waveguides[i].ports["o1"])

# Connect waveguide output to next spiral input (chain the circuits)
for i in range(len(circuits) - 1):
    # Route from waveguide i output (o2) to next circuit's spiral input (o1)
    gf.routing.route_single(
        c_chip,
        port1=waveguides[i].ports["o2"],
        port2=circuits[i+1].ports["o1"],
        cross_section='strip',
        bend='bend_euler'
    )

# Create four additional MZI 1x2_1x2 circuits stacked along x
# Get MZI dimensions for spacing
test_mzi = mzi1x2_1x2_phase_shifter(
    cross_section='strip',
    length_y=0.0,
    length_x=MZI_LENGTH_X,
    delta_length=0.0,
)
mzi_width = test_mzi.xmax - test_mzi.xmin
mzi_height = test_mzi.ymax - test_mzi.ymin

# Create stacked MZIs with consistent y offset to prevent overlap
x_spacing = mzi_width + STACKED_MZI_X_SPACING_EXTRA
y_shift = -(mzi_height / 2 + 5)  # Half height plus 5 um buffer, negative for downward shift
stacked_mzis = []
for i in range(STACKED_MZI_COUNT):
    mzi = c_chip << mzi1x2_1x2_phase_shifter(
        cross_section='strip',
        length_y=0.0,
        length_x=MZI_LENGTH_X,
        delta_length=0.0,
    )
    # Position the MZI: stack along x, with consistent y offset for each
    x_pos = STACKED_MZI_X_START + i * x_spacing
    y_pos = STACKED_MZI_Y_START + i * y_shift  # Consistent downward shift
    mzi.move((x_pos, y_pos))
    stacked_mzis.append(mzi)

# Create four vertical heaters
heaters = []

# Get the ports we want to connect to
ports_to_connect = [
    circuits[0].ports["o1"],  # First spiral input
    circuits[0].ports["o3"],  # MZI 1 output
    circuits[1].ports["o3"],  # MZI 2 output
    circuits[2].ports["o3"],  # MZI 3 output
]

# Create and position heaters vertically
for i, port in enumerate(ports_to_connect):
    heater = c_chip << gf.components.straight_heater_metal(
        length=HEATER_LENGTH,
        cross_section='strip'
    )
    # Rotate to make it vertical (90 degrees)
    heater.rotate(90)

    # Position the heater: place it offset from the port
    heater.movex(port.x - HEATER_OFFSET_X).movey(port.y + HEATER_OFFSET_Y)

    heaters.append(heater)

# Route from each port to its corresponding heater
for i, port in enumerate(ports_to_connect):
    gf.routing.route_single(
        c_chip,
        port1=port,
        port2=heaters[i].ports["o1"],
        cross_section='strip',
        bend='bend_euler'
    )

# Route from vertical heater outputs to stacked MZI inputs
# Based on x-ordering: leftmost heater to leftmost MZI, etc.
heater_to_mzi_connections = [
    (heaters[0].ports["o2"], stacked_mzis[0].ports["o1"]),  # heater_1 → stacked_mzi_1
    (heaters[1].ports["o2"], stacked_mzis[1].ports["o1"]),  # heater_2 → stacked_mzi_2
    (heaters[2].ports["o2"], stacked_mzis[2].ports["o1"]),  # heater_3 → stacked_mzi_3
    (heaters[3].ports["o2"], stacked_mzis[3].ports["o1"]),  # heater_4 → stacked_mzi_4
]

for heater_port, mzi_port in heater_to_mzi_connections:
    gf.routing.route_single(
        c_chip,
        port1=heater_port,
        port2=mzi_port,
        cross_section='strip',
        bend='bend_euler'
    )

# Export the chain's input and output ports
c_chip.add_port("input", port=heaters[0].ports["o1"])  # Input through first heater (changed from o2 to o1)
c_chip.add_port("output", port=waveguides[-1].ports["o2"])  # Last waveguide output (chain output)

# Export heater outputs (o2 ports)
for i, heater in enumerate(heaters):
    if i == 0:
        c_chip.add_port(f"heater_{i+1}_output", port=heater.ports["o2"])
    else:
        c_chip.add_port(f"mzi_{i}_heater_output", port=heater.ports["o2"])

# Export electrical ports for all standalone heaters
for i, heater in enumerate(heaters):
    # Each heater has electrical ports for the metal contacts
    for port in heater.ports:
        if 'e' in port.name:  # Electrical ports
            c_chip.add_port(f"heater_{i+1}_{port.name}", port=port)

# Export electrical ports from MZI heaters in each circuit
for i, circuit in enumerate(circuits):
    for port in circuit.ports:
        if 'mzi_e' in port.name:  # MZI heater electrical ports
            c_chip.add_port(f"circuit_{i+1}_{port.name}", port=port)

# Export electrical ports from stacked MZIs
for i, mzi in enumerate(stacked_mzis):
    for port in mzi.ports:
        if port.port_type == 'electrical':
            c_chip.add_port(f"stacked_mzi_{i+1}_{port.name}", port=port)

# Extend stacked MZI o2 ports to target X position and add fan-in
# First, extend each stacked MZI o2 port using straight waveguides
extended_ports = []
for i, mzi in enumerate(stacked_mzis):
    o2_port = mzi.ports['o2']

    # Calculate the length needed to reach target X
    current_x = o2_port.x
    extension_length = FANIN_TARGET_X - current_x

    if extension_length > 0:
        # Create a straight waveguide to extend to target X
        extension_wg = c_chip << gf.components.straight(
            length=extension_length,
            cross_section='strip'
        )
        extension_wg.connect('o1', o2_port)
        extended_ports.append(extension_wg.ports['o2'])
    else:
        # Already past target X, just use the existing port
        extended_ports.append(o2_port)

# Now create the fan-in starting at target X
# Get the y positions of the extended ports
y_positions = [port.y for port in extended_ports]

# Calculate the center y position for the fan-in output
y_center = sum(y_positions) / len(y_positions)
y_start_output = y_center - (len(extended_ports) - 1) * FANIN_OUTPUT_SPACING / 2

# Create input waveguides for the fan-in
fanin_input_wgs = []
for i, port in enumerate(extended_ports):
    wg = c_chip << gf.components.straight(length=FANIN_INPUT_LENGTH, cross_section='strip')
    wg.connect('o1', port)
    fanin_input_wgs.append(wg)

# Add a 4x2 MMI - we'll connect it directly to the fan-in S-bend outputs
mmi4x2 = c_chip << gf.components.mmi(inputs=4, outputs=2)

# Position the MMI after the fan-in input waveguides
mmi4x2.movex(FANIN_TARGET_X + FANIN_INPUT_LENGTH + FANIN_MMI_OFFSET_X)

# Calculate the target y positions for fan-in outputs (FLIPPED order)
# These will be the positions where the S-bend outputs should end up
fanin_output_y_positions = []
for i in range(len(extended_ports)):
    # Reversed order: start from highest y and go down
    y = y_start_output + (len(extended_ports) - 1 - i) * FANIN_OUTPUT_SPACING
    fanin_output_y_positions.append(y)

# Center the MMI vertically with the calculated fan-in output positions
fanin_y_center = sum(fanin_output_y_positions) / len(fanin_output_y_positions)

# Get MMI input port y positions to calculate its center
mmi_input_ports = [mmi4x2.ports[f'o{i+1}'] for i in range(4)]
mmi_input_y_positions = [p.y for p in mmi_input_ports]
mmi_y_center = sum(mmi_input_y_positions) / len(mmi_input_y_positions)

# Move MMI to align centers
mmi4x2.movey(fanin_y_center - mmi_y_center)

# Now route directly from fan-in inputs to MMI inputs using S-bends
# The S-bends will handle the pitch transition AND connect to the MMI
# Connect with FLIPPED order to MMI inputs
fanin_routes = gf.routing.route_bundle_sbend(
    component=c_chip,
    ports1=[wg.ports['o2'] for wg in fanin_input_wgs],
    ports2=[mmi4x2.ports[f'o{i+1}'] for i in range(3, -1, -1)],  # Reversed: o4, o3, o2, o1
    cross_section='strip'
)

# Export optical ports from stacked MZIs (o1 ports only, since o2 are now connected)
for i, mzi in enumerate(stacked_mzis):
    c_chip.add_port(f"stacked_mzi_{i+1}_o1", port=mzi.ports['o1'])

# Add fan-out after 4x2 MMI to separate the waveguides more
# Get MMI output ports directly
mmi_output_ports = [mmi4x2.ports['o5'], mmi4x2.ports['o6']]

# Calculate center y position for fan-out outputs
mmi_output_y_positions = [p.y for p in mmi_output_ports]
fanout_y_center = sum(mmi_output_y_positions) / len(mmi_output_y_positions)
fanout_total_output_span = (len(mmi_output_ports) - 1) * FANOUT_OUTPUT_SPACING
fanout_y_start_output = fanout_y_center - fanout_total_output_span / 2

# Create output waveguides for the fan-out
# REVERSED order: start from highest y and go down to match MMI output order
fanout_output_wgs = []
for i in range(len(mmi_output_ports)):
    wg = c_chip << gf.components.straight(length=FANOUT_OUTPUT_LENGTH, cross_section='strip')
    wg.movex(mmi4x2.ports['o5'].x + FANOUT_LENGTH_X)  # Position after fan-out transition
    # Reversed: highest y first (i=0 gets highest y position)
    wg.movey(fanout_y_start_output + (len(mmi_output_ports) - 1 - i) * FANOUT_OUTPUT_SPACING)
    fanout_output_wgs.append(wg)

# Create the fan-out using S-bend routing (max 20 um along x)
fanout_routes = gf.routing.route_bundle_sbend(
    component=c_chip,
    ports1=mmi_output_ports,
    ports2=[wg.ports['o1'] for wg in fanout_output_wgs],
    cross_section='strip'
)

# Export the fan-out output ports
c_chip.add_port("mmi4x2_output_1", port=fanout_output_wgs[0].ports['o2'])
c_chip.add_port("mmi4x2_output_2", port=fanout_output_wgs[1].ports['o2'])

# Add grating coupler array for fiber-to-chip coupling
# Waveguide output should be facing -x (180 degrees)
gc_array = c_chip << gf.components.grating_coupler_array(
    n=GC_COUNT,
    pitch=GC_PITCH,
    rotation=GC_ROTATION
)

# Position the grating coupler array
# The array is created centered at origin with ports at 90 degrees (facing +y)
# We need to rotate it so ports face -x (180 degrees)
# Rotation from 90° to 180° requires +90° rotation
gc_array.rotate(90)
gc_array.movex(GC_ARRAY_X)
# Move the grating array along +y by one pitch
gc_array.movey(GC_ARRAY_Y_OFFSET)

# Export grating coupler ports
for i in range(GC_COUNT):
    c_chip.add_port(f"gc_{i}", port=gc_array.ports[f'o{i}'])

# Route fan-out outputs to grating couplers
# After moving GC array by +127 um, the new positions are:
# gc_4: y = 190.5
# gc_5: y = 317.5
# CORRECTED: Fan-out output 0 (higher, y=239.75) → gc_5 (y=317.5), Fan-out output 1 (lower, y=234.75) → gc_4 (y=190.5)
gf.routing.route_single(
    c_chip,
    port1=fanout_output_wgs[0].ports['o2'],  # Higher fan-out output (y=239.75)
    port2=gc_array.ports['o5'],  # gc_5 (y=317.5)
    cross_section='strip',
    bend='bend_euler'
)

gf.routing.route_single(
    c_chip,
    port1=fanout_output_wgs[1].ports['o2'],  # Lower fan-out output (y=234.75)
    port2=gc_array.ports['o4'],  # gc_4 (y=190.5)
    cross_section='strip',
    bend='bend_euler'
)

# Route GC3 to the third MZI-spiral circuit's o2 port (the unused MZI output)
gf.routing.route_single(
    c_chip,
    port1=gc_array.ports['o3'],  # gc_3
    port2=circuits[2].ports['o2'],  # Third MZI-spiral circuit o2 (unused output)
    cross_section='strip',
    bend='bend_euler'
)

# Add loopback between gc_0 and gc_1
gf.routing.route_single(
    c_chip,
    port1=gc_array.ports['o0'],  # gc_0
    port2=gc_array.ports['o1'],  # gc_1
    cross_section='strip',
    bend='bend_euler'
)

# Add loopback between gc_6 and gc_7
gf.routing.route_single(
    c_chip,
    port1=gc_array.ports['o6'],  # gc_6
    port2=gc_array.ports['o7'],  # gc_7
    cross_section='strip',
    bend='bend_euler'
)

# ============================================================================
# CREATE BOND PADS FOR ELECTRICAL ROUTING
# ============================================================================

# Get current chip extent
chip_xmin = c_chip.xmin
chip_xmax = c_chip.xmax
chip_ymin = c_chip.ymin
chip_ymax = c_chip.ymax

print(f"\n=== Chip Extent (before bond pads) ===")
print(f"X: [{chip_xmin:.1f}, {chip_xmax:.1f}] um")
print(f"Y: [{chip_ymin:.1f}, {chip_ymax:.1f}] um")

# Calculate bond pad edge positions
left_edge_x = chip_xmin - EDGE_BUFFER  # Left edge x-coordinate for bond pads
bottom_edge_y = chip_ymin - EDGE_BUFFER  # Bottom edge y-coordinate for bond pads

print(f"\n=== Bond Pad Edge Positions (with {EDGE_BUFFER} um buffer) ===")
print(f"LEFT edge x: {left_edge_x:.1f} um")
print(f"BOTTOM edge y: {bottom_edge_y:.1f} um")

# Group heater ports by heater and end (left/right)
# Each heater has 2 ends, each end has 4 ports that should be merged into 1 bond pad

heater_groups = {
    # Standalone heaters (4 heaters x 2 ends = 8 bond pads)
    'heater_1_left': ['heater_1_l_e1', 'heater_1_l_e2', 'heater_1_l_e3', 'heater_1_l_e4'],
    'heater_1_right': ['heater_1_r_e1', 'heater_1_r_e2', 'heater_1_r_e3', 'heater_1_r_e4'],
    'heater_2_left': ['heater_2_l_e1', 'heater_2_l_e2', 'heater_2_l_e3', 'heater_2_l_e4'],
    'heater_2_right': ['heater_2_r_e1', 'heater_2_r_e2', 'heater_2_r_e3', 'heater_2_r_e4'],
    'heater_3_left': ['heater_3_l_e1', 'heater_3_l_e2', 'heater_3_l_e3', 'heater_3_l_e4'],
    'heater_3_right': ['heater_3_r_e1', 'heater_3_r_e2', 'heater_3_r_e3', 'heater_3_r_e4'],
    'heater_4_left': ['heater_4_l_e1', 'heater_4_l_e2', 'heater_4_l_e3', 'heater_4_l_e4'],
    'heater_4_right': ['heater_4_r_e1', 'heater_4_r_e2', 'heater_4_r_e3', 'heater_4_r_e4'],

    # Circuit MZI heaters (3 circuits x 2 ends = 6 bond pads)
    # Each MZI has 2 heater sections (e1,e3,e6,e8 and e2,e4,e5,e7)
    'circuit_1_mzi_1': ['circuit_1_mzi_e1', 'circuit_1_mzi_e3', 'circuit_1_mzi_e6', 'circuit_1_mzi_e8'],
    'circuit_1_mzi_2': ['circuit_1_mzi_e2', 'circuit_1_mzi_e4', 'circuit_1_mzi_e5', 'circuit_1_mzi_e7'],
    'circuit_2_mzi_1': ['circuit_2_mzi_e1', 'circuit_2_mzi_e3', 'circuit_2_mzi_e6', 'circuit_2_mzi_e8'],
    'circuit_2_mzi_2': ['circuit_2_mzi_e2', 'circuit_2_mzi_e4', 'circuit_2_mzi_e5', 'circuit_2_mzi_e7'],
    'circuit_3_mzi_1': ['circuit_3_mzi_e1', 'circuit_3_mzi_e3', 'circuit_3_mzi_e6', 'circuit_3_mzi_e8'],
    'circuit_3_mzi_2': ['circuit_3_mzi_e2', 'circuit_3_mzi_e4', 'circuit_3_mzi_e5', 'circuit_3_mzi_e7'],

    # Stacked MZI heaters (4 MZIs x 2 ends = 8 bond pads)
    'stacked_mzi_1_1': ['stacked_mzi_1_e1', 'stacked_mzi_1_e3', 'stacked_mzi_1_e6', 'stacked_mzi_1_e8'],
    'stacked_mzi_1_2': ['stacked_mzi_1_e2', 'stacked_mzi_1_e4', 'stacked_mzi_1_e5', 'stacked_mzi_1_e7'],
    'stacked_mzi_2_1': ['stacked_mzi_2_e1', 'stacked_mzi_2_e3', 'stacked_mzi_2_e6', 'stacked_mzi_2_e8'],
    'stacked_mzi_2_2': ['stacked_mzi_2_e2', 'stacked_mzi_2_e4', 'stacked_mzi_2_e5', 'stacked_mzi_2_e7'],
    'stacked_mzi_3_1': ['stacked_mzi_3_e1', 'stacked_mzi_3_e3', 'stacked_mzi_3_e6', 'stacked_mzi_3_e8'],
    'stacked_mzi_3_2': ['stacked_mzi_3_e2', 'stacked_mzi_3_e4', 'stacked_mzi_3_e5', 'stacked_mzi_3_e7'],
    'stacked_mzi_4_1': ['stacked_mzi_4_e1', 'stacked_mzi_4_e3', 'stacked_mzi_4_e6', 'stacked_mzi_4_e8'],
    'stacked_mzi_4_2': ['stacked_mzi_4_e2', 'stacked_mzi_4_e4', 'stacked_mzi_4_e5', 'stacked_mzi_4_e7'],
}

# Calculate average position for each group and determine which edge to route to
bond_pad_info = []
for group_name, port_names in heater_groups.items():
    # Get the ports
    ports = [c_chip.ports[name] for name in port_names if name in c_chip.ports]
    if not ports:
        continue

    # Calculate average position
    avg_x = sum(p.x for p in ports) / len(ports)
    avg_y = sum(p.y for p in ports) / len(ports)

    # Decide which edge: LEFT if x < 100, BOTTOM otherwise
    edge = 'LEFT' if avg_x < 100 else 'BOTTOM'

    bond_pad_info.append({
        'name': group_name,
        'ports': ports,
        'avg_x': avg_x,
        'avg_y': avg_y,
        'edge': edge
    })

# Sort by position
left_pads = sorted([p for p in bond_pad_info if p['edge'] == 'LEFT'], key=lambda p: p['avg_y'])
bottom_pads = sorted([p for p in bond_pad_info if p['edge'] == 'BOTTOM'], key=lambda p: p['avg_x'])

print(f"\n=== Bond Pad Assignment ===")
print(f"Total heater groups: {len(bond_pad_info)}")
print(f"LEFT edge bond pads: {len(left_pads)}")
print(f"BOTTOM edge bond pads: {len(bottom_pads)}")

# Create bond pads along LEFT edge
for i, pad_info in enumerate(left_pads):
    # Create a rectangular bond pad
    pad = c_chip << gf.components.rectangle(size=(PAD_SIZE, PAD_SIZE), layer='M3')
    pad_y = LEFT_PAD_START_Y + i * PAD_PITCH
    pad.move((left_edge_x, pad_y))

    # Add port to the bond pad for routing
    c_chip.add_port(f"bondpad_{pad_info['name']}",
                    center=(left_edge_x + PAD_SIZE/2, pad_y + PAD_SIZE/2),
                    width=PAD_PORT_WIDTH, orientation=0, layer='M3', port_type='electrical')

    # Store mapping for later routing
    pad_info['bondpad_name'] = f"bondpad_{pad_info['name']}"

print(f"Created {len(left_pads)} bond pads on LEFT edge")
print(f"  Y range: [{LEFT_PAD_START_Y:.1f}, {LEFT_PAD_START_Y + (len(left_pads)-1)*PAD_PITCH:.1f}]")

# Create bond pads along BOTTOM edge
for i, pad_info in enumerate(bottom_pads):
    # Create a rectangular bond pad
    pad = c_chip << gf.components.rectangle(size=(PAD_SIZE, PAD_SIZE), layer='M3')
    pad_x = BOTTOM_PAD_START_X + i * PAD_PITCH
    pad.move((pad_x, bottom_edge_y))

    # Add port to the bond pad for routing
    c_chip.add_port(f"bondpad_{pad_info['name']}",
                    center=(pad_x + PAD_SIZE/2, bottom_edge_y + PAD_SIZE/2),
                    width=PAD_PORT_WIDTH, orientation=90, layer='M3', port_type='electrical')

    # Store mapping for later routing
    pad_info['bondpad_name'] = f"bondpad_{pad_info['name']}"

print(f"Created {len(bottom_pads)} bond pads on BOTTOM edge")
print(f"  X range: [{BOTTOM_PAD_START_X:.1f}, {BOTTOM_PAD_START_X + (len(bottom_pads)-1)*PAD_PITCH:.1f}]")

# ============================================================================
# ELECTRICAL ROUTING: Connect heater ports to bond pads
# ============================================================================

print(f"\n=== Electrical Routing ===")

# Route LEFT edge pads
# Strategy: Maintain Y-order to avoid crossings and overlaps
# 1. Collect all merge points and sort by Y
# 2. Assign each a unique Y-channel at intermediate X (spaced by metal_width)
# 3. Route: merge -> intermediate_x at unique Y -> bond pad's Y -> bond pad
print(f"Routing {len(left_pads)} groups to LEFT edge...")

# Define intermediate X position for LEFT edge routing (between ports and pads)
# This should be to the left of all heater ports
intermediate_x_left = left_edge_x + INTERMEDIATE_OFFSET_LEFT

# First pass: calculate all merge points and assign unique Y channels
left_routing_info = []
for i, pad_info in enumerate(left_pads):
    ports = pad_info['ports']
    bondpad_name = pad_info['bondpad_name']
    bondpad_port = c_chip.ports[bondpad_name]

    # Calculate merge point at average position
    merge_point_x = sum(p.x for p in ports) / len(ports)
    merge_point_y = sum(p.y for p in ports) / len(ports)

    left_routing_info.append({
        'pad_info': pad_info,
        'ports': ports,
        'bondpad_port': bondpad_port,
        'merge_x': merge_point_x,
        'merge_y': merge_point_y,
        'channel_y': bondpad_port.y,
        'sort_key': merge_point_y  # Sort by merge point Y
    })

# Sort by Y position to assign non-overlapping channels
left_routing_info.sort(key=lambda x: x['sort_key'])

# Assign unique Y positions at intermediate_x (spaced by metal_width + gap)
channel_spacing = METAL_WIDTH + CHANNEL_SPACING_GAP
for idx, info in enumerate(left_routing_info):
    # Assign Y position at intermediate X, evenly spaced
    info['intermediate_y'] = info['merge_y'] + idx * channel_spacing - (len(left_routing_info) - 1) * channel_spacing / 2

# Second pass: do the actual routing
for info in left_routing_info:
    ports = info['ports']
    merge_point_x = info['merge_x']
    merge_point_y = info['merge_y']
    intermediate_y = info['intermediate_y']
    channel_y = info['channel_y']
    bondpad_port = info['bondpad_port']

    # Step 1: Route each port to merge point (short local connections)
    for port in ports:
        points = [
            (port.x, port.y),
            (merge_point_x, merge_point_y)
        ]
        path = gf.Path(points)
        trace = c_chip << path.extrude(width=METAL_WIDTH, layer=METAL_LAYER)

    # Step 2: Route from merge point to bond pad with Manhattan routing
    # Path: merge -> (merge_x, intermediate_y) -> (intermediate_x, intermediate_y) -> (intermediate_x, channel_y) -> bond pad
    route_points = [
        (merge_point_x, merge_point_y),        # Start at merge point
        (merge_point_x, intermediate_y),        # Go VERTICAL to intermediate Y level
        (intermediate_x_left, intermediate_y),  # Go HORIZONTAL to intermediate X
        (intermediate_x_left, channel_y),       # Go VERTICAL to bond pad's Y channel
        (bondpad_port.x, channel_y)             # Go HORIZONTAL to bond pad
    ]

    path = gf.Path(route_points)
    trace = c_chip << path.extrude(width=METAL_WIDTH, layer=METAL_LAYER)

print(f"  ✓ Routed {len(left_pads)} groups to LEFT edge")

# Route BOTTOM edge pads
# Strategy: Maintain X-order to avoid crossings and overlaps
# 1. Collect all merge points and sort by X
# 2. Assign each a unique X-channel at intermediate Y (spaced by metal_width)
# 3. Route: merge -> intermediate_y at unique X -> bond pad's X -> bond pad
print(f"Routing {len(bottom_pads)} groups to BOTTOM edge...")

# Define intermediate Y position for BOTTOM edge routing (between ports and pads)
# This should be below all heater ports
intermediate_y_bottom = bottom_edge_y + INTERMEDIATE_OFFSET_BOTTOM

# First pass: calculate all merge points and assign unique X channels
bottom_routing_info = []
for i, pad_info in enumerate(bottom_pads):
    ports = pad_info['ports']
    bondpad_name = pad_info['bondpad_name']
    bondpad_port = c_chip.ports[bondpad_name]

    # Calculate merge point at average position
    merge_point_x = sum(p.x for p in ports) / len(ports)
    merge_point_y = sum(p.y for p in ports) / len(ports)

    bottom_routing_info.append({
        'pad_info': pad_info,
        'ports': ports,
        'bondpad_port': bondpad_port,
        'merge_x': merge_point_x,
        'merge_y': merge_point_y,
        'channel_x': bondpad_port.x,
        'sort_key': merge_point_x  # Sort by merge point X
    })

# Sort by X position to assign non-overlapping channels
bottom_routing_info.sort(key=lambda x: x['sort_key'])

# Assign unique X positions at intermediate_y (spaced by metal_width + gap)
channel_spacing = METAL_WIDTH + CHANNEL_SPACING_GAP
for idx, info in enumerate(bottom_routing_info):
    # Assign X position at intermediate Y, evenly spaced
    info['intermediate_x'] = info['merge_x'] + idx * channel_spacing - (len(bottom_routing_info) - 1) * channel_spacing / 2

# Second pass: do the actual routing
for info in bottom_routing_info:
    ports = info['ports']
    merge_point_x = info['merge_x']
    merge_point_y = info['merge_y']
    intermediate_x = info['intermediate_x']
    channel_x = info['channel_x']
    bondpad_port = info['bondpad_port']

    # Step 1: Route each port to merge point (short local connections)
    for port in ports:
        points = [
            (port.x, port.y),
            (merge_point_x, merge_point_y)
        ]
        path = gf.Path(points)
        trace = c_chip << path.extrude(width=METAL_WIDTH, layer=METAL_LAYER)

    # Step 2: Route from merge point to bond pad with Manhattan routing
    # Path: merge -> (intermediate_x, merge_y) -> (intermediate_x, intermediate_y) -> (channel_x, intermediate_y) -> bond pad
    route_points = [
        (merge_point_x, merge_point_y),         # Start at merge point
        (intermediate_x, merge_point_y),        # Go HORIZONTAL to intermediate X level
        (intermediate_x, intermediate_y_bottom), # Go VERTICAL to intermediate Y
        (channel_x, intermediate_y_bottom),     # Go HORIZONTAL to bond pad's X channel
        (channel_x, bondpad_port.y)             # Go VERTICAL to bond pad
    ]

    path = gf.Path(route_points)
    trace = c_chip << path.extrude(width=METAL_WIDTH, layer=METAL_LAYER)

print(f"  ✓ Routed {len(bottom_pads)} groups to BOTTOM edge")
print(f"\n✓ Electrical routing complete!")
print(f"  Total traces: {len(left_pads) + len(bottom_pads)}")
print(f"  Metal width: {METAL_WIDTH} μm")
print(f"  Metal layer: M3 ({METAL_LAYER[0]}/{METAL_LAYER[1]})")

# Print port information
print("\n=== Chip Ports ===")
c_chip.pprint_ports()

# Option 1: Add pins with port names and text labels (RECOMMENDED)
# c_chip_with_pins = add_pins_container(c_chip)
# c_chip_with_pins.write_gds("test.gds")

# Option 2: Just draw port markers on their layers (without text labels)
# c_chip.draw_ports()
c_chip.write_gds("test.gds")

# Show in KLayout
# c_chip_with_pins.show()

