---
title: VisiData
description: Terminal-based interactive multitool for tabular data exploration with keyboard shortcuts, data visualization, and Python integration.
date: 2025-12-29
tags:
  - data
  - cli
  - terminal
  - visualization
  - software
---

[VisiData](https://visidata.org/) is an open-source interactive multitool for exploring and manipulating tabular data in the terminal. It combines the clarity of a spreadsheet, the efficiency of the terminal, and the power of Python into a lightweight utility that can handle millions of rows.

Key features:

- Multi-format support: CSV, TSV, JSON, Excel, SQL, HDF5, YAML, and more
- Terminal-based interface for quick data exploration
- Built-in visualization: histograms, scatterplots, and geographic maps
- Python integration for computational operations
- Session management for reproducible workflows
- No need to leave the command line

From a user agency perspective, VisiData is excellent because it's format-agnostic, runs anywhere with a terminal, and provides powerful data manipulation without vendor lock-in or cloud dependencies.

# VisiData Cheat Sheet

A quick reference guide for VisiData v3.3 keyboard shortcuts and commands.

## Getting Started

### Installation

```bash
# Using pip
pip install visidata

# Using Homebrew (macOS)
brew install visidata

# Using apt (Debian/Ubuntu)
sudo apt install visidata
```

### Opening Files

```bash
# Open single file
vd data.csv

# Open multiple files as separate sheets
vd file1.csv file2.json file3.xlsx

# Open from URL
vd https://example.com/data.csv

# Open from stdin
cat data.csv | vd

# Open SQLite database
vd database.db

# Open directory as sheet of filenames
vd .
```

## Program Control

### Basic Commands

| Key | Action |
|-----|--------|
| `q` | Quit current sheet |
| `Q` | Quit sheet and free memory |
| `gq` | Exit cleanly (all sheets) |
| `^Q` | Exit immediately (force quit) |
| `^C` | Cancel current operation or abort threads |
| `g^C` | Abort all async threads |

### Help & Documentation

| Key | Action |
|-----|--------|
| `Alt+H` | Open help menu |
| `g^H` | View manual page |
| `z^H` | Display command names and bindings |
| `Space` | Open command palette (search commands) |

## Navigation

### Cursor Movement

```
Basic movement (vim-style or arrows):
  h/j/k/l  or  ←/↓/↑/→    Move cursor left/down/up/right

Jump to edges:
  gh / gj / gk / gl       Go to leftmost/bottom/top/rightmost cell
  G / gg                  Go to last/first row
  ^B / ^F                 Page up/down (scroll backward/forward)
  ^Left / ^Right          Page left/right

Center and navigate:
  zz                      Center current row on screen
  ^^                      Jump to previous sheet (toggle)
  Enter                   Dive into current cell (open as new sheet)
```

### Column Navigation

| Key | Action |
|-----|--------|
| `H` / `L` | Jump to first/last column |
| `[` / `]` | Sort by current/previous column ascending |
| `{` / `}` | Sort by current/previous column descending |

## Data Viewing

### Sheet Management

| Key | Action |
|-----|--------|
| `S` | Open Sheets sheet (list all sheets) |
| `^6` or `^^` | Jump to previous sheet |
| `gS` | Open Status History |
| `Alt+number` | Jump to sheet by index |

### Column Width

| Key | Action |
|-----|--------|
| `_` | Toggle column width (full width/default) |
| `g_` | Toggle widths for all visible columns |
| `z_` | Set column width to specific number |
| `-` | Hide current column |
| `gv` | Unhide all columns |

## Column Operations

### Column Types

```
Set column type:
  ~                       String (text)
  #                       Integer
  %                       Float
  $                       Currency
  @                       Date

Advanced types:
  z#                      Length of string
  z%                      Float with custom precision
  z@                      Date with custom format
```

### Column Manipulation

| Key | Action |
|-----|--------|
| `^` | Rename current column |
| `!` | Toggle column as key column (for joins) |
| `=` | Create new column from Python expression |
| `g=` | Set current column to Python expression |
| `'` | Add frozen copy of current column |
| `z'` | Add evaluated formula column |

### Column Visibility

| Key | Action |
|-----|--------|
| `-` | Hide current column |
| `gv` | Unhide all columns |
| `g-` | Hide columns with only one value |
| `C` | Open Columns sheet (column metadata) |

## Row Operations and Selection

### Selection

```
Single row selection:
  s                       Select current row
  t                       Toggle selection of current row
  u                       Unselect current row

Bulk selection:
  gs                      Select all rows
  gt                      Toggle selection of all rows
  gu                      Unselect all rows

Pattern selection:
  |  (pipe)               Select rows matching regex in current column
  \  (backslash)          Unselect rows matching regex in current column
  g|                      Select rows matching regex in any visible column
  g\                      Unselect rows matching regex in any visible column
  ,  (comma)              Select rows where current column matches current cell
  g,                      Select rows where any column matches current row
```

### Filtering

| Key | Action |
|-----|--------|
| `"` | Open duplicate sheet with only selected rows |
| `g"` | Open duplicate sheet with all rows |
| `z"` | Open duplicate sheet with deepcopy |

## Searching and Filtering

### Search Commands

```
Search in column:
  /                       Search forward in current column
  ?                       Search backward in current column
  n / N                   Next/previous match

Search across columns:
  g/                      Search forward in all visible columns
  g?                      Search backward in all visible columns

Expression search:
  z/                      Search forward by Python expression
  z?                      Search backward by Python expression
```

### Navigate by Value

| Key | Action |
|-----|--------|
| `<` / `>` | Jump to previous/next value in column |
| `z<` / `z>` | Jump to previous/next null value |

## Editing Data

### Basic Editing

```
Edit operations:
  e                       Edit current cell
  ge                      Edit current cell and move right
  ^O                      Open cell in external $EDITOR

Adding rows:
  a                       Append blank row after current row
  ga                      Append N blank rows
  za                      Append row with duplicate values

Deleting:
  d                       Delete current row
  gd                      Delete selected rows
```

### Copy, Cut, Paste

| Key | Action |
|-----|--------|
| `y` | Yank (copy) current row |
| `gy` | Yank (copy) selected rows |
| `x` | Cut current row |
| `gx` | Cut selected rows |
| `p` | Paste after current row |
| `P` | Paste before current row |

### Fill Operations

| Key | Action |
|-----|--------|
| `f` | Fill nulls in column with value |
| `gf` | Fill nulls in all visible columns |

## Sorting and Ordering

### Sort Commands

```
Sort by column:
  [                       Sort ascending by current column
  ]                       Sort descending by current column
  g[                      Sort ascending by all key columns
  g]                      Sort descending by all key columns

Reverse and shuffle:
  z[                      Reverse sort order
  gz[                     Shuffle rows randomly
```

## Data Manipulation

### Derived Sheets

```
Aggregation and analysis:
  F                       Create frequency table for current column
  gF                      Create frequency table for all key columns

Statistical analysis:
  I                       Describe sheet (show stats for all columns)
  gI                      Describe column (detailed stats)

Pivot and reshape:
  W                       Create pivot table
  M                       Melt sheet (unpivot)
  T                       Transpose rows and columns
```

### Joins and Combinations

| Key | Action |
|-----|--------|
| `&` | Join two sheets (inner join) |
| `+` | Concatenate two sheets (append) |
| `*` | Join sheets (multiply/product) |

## Aggregation and Analysis

### Frequency Tables

```bash
# Open file and create frequency table
vd data.csv

# Navigate to column of interest
# Press F to create frequency table
F

# The frequency table shows:
# - Unique values in the column
# - Count of each value
# - Percentage of total
```

### Statistics

```
Show column statistics:
  I                       Describe sheet (all columns)
  gI                      Describe current column in detail

Statistics shown:
  - Count, nulls, distinct values
  - Mean, median, mode
  - Min, max, standard deviation
  - Quantiles
```

### Aggregations

| Key | Action |
|-----|--------|
| `+` | Add aggregator to current column |
| `z+` | Show available aggregators |

Common aggregators:
- `sum` - Sum of values
- `mean` - Average value
- `median` - Median value
- `min` / `max` - Minimum/maximum value
- `count` - Count of non-null values
- `distinct` - Count of unique values

## Visualization

### Creating Plots

```
Plot commands:
  .                       Plot current numeric column (histogram)
  g.                      Plot all visible numeric columns (scatterplot)

Canvas navigation:
  +/-                     Zoom in/out
  _                       Fit to extent
  x                       Set x-axis range
  y                       Set y-axis range
  d                       Delete plotted row
  gd                      Delete selected rows
  Enter                   Open row details sheet
```

### Plot Types

VisiData automatically chooses plot type based on columns:
- **1 numeric column**: Histogram
- **2 numeric columns**: Scatterplot
- **1 numeric + 1 categorical**: Bar chart
- **Geographic columns**: Map visualization

## Saving and Exporting

### Save Commands

```bash
# Save current sheet
^S

# You'll be prompted for filename and format
# VisiData auto-detects format from extension:
data.csv          # CSV
data.tsv          # TSV
data.json         # JSON
data.xlsx         # Excel
data.html         # HTML table
data.md           # Markdown table
```

### Format-Specific Options

| Format | Extension | Notes |
|--------|-----------|-------|
| CSV | `.csv` | Standard comma-separated |
| TSV | `.tsv` | Tab-separated |
| JSON | `.json` | Array of objects |
| Excel | `.xlsx` | Requires openpyxl |
| SQLite | `.db` / `.sqlite` | Requires sqlite3 |
| HTML | `.html` | Web table |
| Markdown | `.md` | Markdown table |

### Save Selected Rows Only

```
# Select rows you want to export
s  (on each row)

# Open new sheet with only selected rows
"

# Save the filtered sheet
^S
```

## Advanced Features

### Python Expressions

```
Create computed columns:
  =                       New column from expression

Example expressions:
  =len(name)              Column with length of 'name' column
  =price * quantity       Multiply two columns
  =date.year              Extract year from date column
  =name.upper()           Convert name to uppercase
```

### Macros

| Key | Action |
|-----|--------|
| `m` followed by key | Start recording macro |
| `m` again | Stop recording |
| `gm` | Open macro sheet |
| `` ` `` + key | Play macro |

### Command Log

```
CommandLog tracks all operations:
  D                       Open CommandLog sheet

The CommandLog shows:
  - Every command executed
  - Timestamp
  - Sheet name
  - Can be saved as Python script

Save CommandLog:
  ^D                      Save CommandLog
```

### Undo/Redo

| Key | Action |
|-----|--------|
| `U` | Undo last operation |
| `R` | Redo undone operation |

## Configuration

### Options Sheet

```
Open options:
  O                       Open Options sheet

Common options to configure:
  - disp_column_sep       Column separator character
  - color_*               Color scheme settings
  - disp_date_fmt         Date format string
  - encoding              File encoding (default utf-8)
```

### Configuration File

VisiData reads configuration from `~/.visidatarc` (Python file):

```python
# ~/.visidatarc
from visidata import *

# Set options
options.color_key_col = 'cyan'
options.disp_date_fmt = '%Y-%m-%d'

# Custom keybindings
Sheet.addCommand('', 'custom-command', 'custom_function()')
```

## Real-World Examples

### CSV Analysis

```bash
# Open CSV and explore
vd sales_data.csv

# Create frequency table of product categories
# Navigate to 'category' column, press F

# Calculate total sales by category
# Press W for pivot table
# Set category as row, select sales column
# Press + to add 'sum' aggregator

# Export results
# Press ^S, enter filename.csv
```

### Data Cleaning

```bash
# Open messy data
vd messy.csv

# Find null values
# Press z< to jump to next null

# Fill nulls with default value
# Press f, enter replacement value

# Remove duplicate rows
# Select columns as keys with !
# Press F to see duplicates
# Delete duplicates with gd

# Export cleaned data
# Press ^S
```

### Log File Analysis

```bash
# Open log file
vd server.log

# Search for errors
# Press / then type "ERROR"
# Press n to cycle through matches

# Create frequency table of error types
# Press F on the error column

# Select rows with specific error
# Use , to select matching rows
# Press " to open sheet with only those rows

# Export for further analysis
# Press ^S, save as errors.csv
```

### JSON Exploration

```bash
# Open nested JSON
vd complex_api_response.json

# VisiData automatically flattens nested structures
# Press Enter on nested objects to dive deeper
# Press ^^ to go back to parent sheet

# Create columns from nested data
# Use = with expressions like item.price
```

### Joining Datasets

```bash
# Open multiple files
vd customers.csv orders.csv

# Switch to Sheets sheet
# Press S

# Mark key columns in each sheet
# Navigate to customer_id column
# Press ! to mark as key column

# Open join sheet
# Press & for inner join

# Save joined result
# Press ^S
```

## Performance Tips

```
For large files:

1. Lazy loading:
   # VisiData loads data progressively
   # Navigate without waiting for full load

2. Sampling:
   # Open subset of rows
   vd --replay-wait 0 huge.csv

3. Use filters early:
   # Select and filter to reduce working set
   # Use " to create filtered sheet

4. Column types:
   # Set appropriate types (# for int, % for float)
   # Improves sorting and aggregation performance

5. Memory management:
   # Use Q instead of q to free memory
   # Close unused sheets
```

## Troubleshooting

### Common Issues

```
Problem: Garbled unicode characters
Solution: Set encoding
  vd --encoding=utf-8 file.csv

Problem: Column too narrow to see data
Solution: Auto-fit width
  Press _ to expand current column

Problem: Can't edit cells
Solution: Check if column is key
  Key columns (!) are read-only by default

Problem: Slow performance on large file
Solution: Filter to reduce working set
  Select relevant rows, press "

Problem: Date not parsing correctly
Solution: Set date format
  Press @ then specify format like %Y-%m-%d
```

### Getting Help

```
In VisiData:
  Alt+H                   Open help menu
  g^H                     View manual
  Space                   Command palette (search commands)
  z^H                     Show all keybindings

External resources:
  https://visidata.org    Official documentation
  Alt+H -> Tutorial       Built-in tutorial
  #visidata on IRC        Community support
```

## Quick Reference

| Command | Purpose |
|---------|---------|
| `vd file.csv` | Open file in VisiData |
| `q` | Quit current sheet |
| `Alt+H` | Help menu |
| `h/j/k/l` | Navigate (left/down/up/right) |
| `/` | Search in column |
| `s` | Select row |
| `F` | Frequency table |
| `I` | Describe sheet (statistics) |
| `W` | Pivot table |
| `.` | Plot/visualize |
| `=` | Create column from expression |
| `e` | Edit cell |
| `^S` | Save sheet |
| `Space` | Command palette |

## Keyboard Layout Summary

```
Movement: h/j/k/l (vim) or arrow keys
Pages: ^F/^B (forward/back), ^Left/^Right
Edges: G/gg (bottom/top), gh/gj/gk/gl (left/bottom/top/right)

Selection: s (select), t (toggle), u (unselect)
           | (select regex), , (select value)

Types: ~ (str), # (int), % (float), $ (currency), @ (date)

Actions: e (edit), d (delete), a (append), y (yank), p (paste)

Analysis: F (frequency), I (describe), W (pivot), . (plot)

Special: = (expr), ! (key), ^ (rename), _ (width)

Sheets: S (sheets), C (columns), D (cmdlog), O (options)
```

---

**Tip**: Start with `vd --play tutorial` for an interactive tutorial, or press `Alt+H` once inside VisiData for context-sensitive help!
