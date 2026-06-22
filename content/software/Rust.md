---
author:
  - "[[Me]]"
created: 2026-01-12
topics:
  - Software
status:
tags:
  - note
  - software
  - rust
  - programming
title: Rust
---
## Areas I need to learn more deeply
- Lifetimes
- Collections
- Async
- Tests
## Learning Materials
- https://fasterthanli.me/articles/a-half-hour-to-learn-rust
## Variables
- Variable bindings are immutable by default
## Packages and Crates
### Hierarchy

  1. **Workspace** = collection of crates that share dependencies
  2. **Crate** = compilation unit (a library or binary)
  3. **Module** = namespace within a crate (can be a file or directory)
  4. **`mod x;`** = "include module x from either x.rs or x/mod.rs"

- Package (Cargo.toml)
	- Crate
		- Module
			- Submodule
				- Function

```rust
// To bring into scope use CRATE::MODULE::FUNCTION;
use std::cmp::min;
```
- Crates are either:
	- **binary** crates
		- must have a `main` function
	- **library** crates
- A _package_ is a bundle of one or more crates that provides a set of functionality. A package contains a _Cargo.toml_ file that describes how to build those crates.
- A package can have many binary crates, but at most only one **library** crate
- If a package contains _src/main.rs_ and _src/lib.rs_, it has two crates: a binary and a library, both with the same name as the package. 
- A package can have multiple binary crates by placing files in the _src/bin_ directory: Each file will be a separate binary crate.
- The `mod` keyword 
- Visibility Modifiers
	- `mod foo;`  Private to parent module
	- `pub(crate) mod foo;`  Visible within entire crate
	- `pub mod foo;` Visible outside the crate
- `extern crate radicle_oid as oid;` to give an external crate a shorthand name
## Structs and methods

```rust
struct Number {
    odd: bool,
    value: i32,
}


impl Number {
    fn is_positive(self) -> bool {
        self.value > 0
    }
}
```

### Tuple struct

Tuple struct (often called the "newtype pattern" in Rust):
It creates a new type `ObjectId` that wraps a single `Oid` value. The Oid is stored as an unnamed field accessed via .0.

This is **different** from a regular struct with named fields:  
```rust
// Named field version (not used here)  
pub struct ObjectId { oid: Oid }
```

The newtype pattern is commonly used to:
1. **Add type safety** - `ObjectId` and `Oid` are distinct types, so the compiler prevents mixing them up
2. **Implement traits** - You can implement traits for ObjectId that you couldn't for Oid (due to orphan rules)
3. **Control the API** - Hide or expose different functionality than the wrapped type

	In this file, you can see the pattern in action:

- Line 65-71: Deref lets you use ObjectId like an Oid when needed
- Lines 39-63: Various From implementations for conversions
- Line 27: #[serde(transparent)] makes it serialize/deserialize as if it were just an Oid

### `Deref` and auto-deref coercion

Implementing `Deref` on a wrapper type lets Rust automatically forward method calls to the inner type. When you call a method on `&MyWrapper` and `MyWrapper` doesn't have that method, Rust dereferences it to `&InnerType` and tries again — recursively, as many times as needed.

```rust
use std::ops::Deref;

struct Meters(f64);

impl Deref for Meters {
    type Target = f64;

    fn deref(&self) -> &f64 {
        &self.0
    }
}

fn main() {
    let m = Meters(3.5);

    // These all work because Rust auto-derefs &Meters → &f64:
    println!("{}", m.abs());   // f64::abs()
    println!("{}", m.sqrt());  // f64::sqrt()
    let x: f64 = *m;           // explicit deref also works
}
```

This is especially useful with the newtype pattern — you get type safety at the call site while still being able to use all the inner type's methods without wrapping each one manually.

**Coercion sites** — Rust inserts the deref automatically at:
- function/method arguments: `fn takes_str(s: &str)` accepts `&String`
- assignment with a known target type
- `*` dereference expressions

**Caution**: `Deref` is intended for smart pointer types (`Box<T>`, `Rc<T>`, `Arc<T>`, `String`, `Vec<T>` all use it). Implementing it on a general newtype just for convenience can make code harder to reason about — if you want to expose the inner type's full API, prefer `Deref`; if you want a sealed wrapper, don't implement it.

## Ownership & Borrowing

- When assigning a value to a variable, it's ownership can be moved or the value can be copied. 
- Moving or copying depends on the type: if it's stored on the **heap**, it's **moved** (unless it implements the `Copy` trait)
- Integer, Boolean, Character, and Floating Point types, implement the copy trait, and are therefore copied on assignment 
- By default, passing variables stored on the heap to functions will be moved. 
	- This can be tedious because you need to return ownership. 
	- To avoid this, the function can take a reference, leading to borrowing instead of moving.
- A reference’s scope starts from where it is introduced and continues through the last time that reference is used

```rust
fn main() {
    // MOVING (tedious - need to return ownership)
    let s1 = String::from("hello");
    let s1 = takes_ownership(s1); // must reassign to get it back
    println!("{}", s1);
    
    // BORROWING (cleaner)
    let s2 = String::from("world");
    borrows(&s2); // s2 still valid, no reassignment needed
    println!("{}", s2);
}

fn takes_ownership(s: String) -> String {
    println!("{}", s);
    s // must return to give back ownership
}

fn borrows(s: &String) {
    println!("{}", s);
    // no return needed
}
```

For a function to borrow it needs a reference:
```rust
fn print_number(n: &Number) {
    println!("{} number {}", if n.odd { "odd" } else { "even" }, n.value);
}

fn main() {
    let n = Number { odd: true, value: 51 };
    print_number(&n); // `n` is borrowed for the time of the call
    print_number(&n); // `n` is borrowed again
}
```
## Traits
Traits are something multiple types can have in common:
```rust
trait Signed { 
	fn is_strictly_negative(self) -> bool; 
}
```
### Orphan Rules
You can implement:
- one of your traits on anyone’s type
- anyone’s trait on one of your types
- but not a foreign trait on a foreign type
### Trait Bounds

Trait bounds constrain generic type parameters to only types that implement certain traits:

```rust
// T must implement Display
fn print<T: std::fmt::Display>(val: T) {
    println!("{}", val);
}

// Multiple bounds with +
fn print_and_clone<T: std::fmt::Display + Clone>(val: T) { }

// where clause - same meaning, cleaner for complex bounds
fn compare<T>(left: T, right: T)
where
    T: std::fmt::Debug + PartialEq,
{ }
```

#### Supertraits

A supertrait bound on a trait declaration requires implementors to also implement another trait:

```rust
pub trait Copy: Clone {}  // anything implementing Copy must also implement Clone
```

This means wherever `Copy` is required, `Clone` is implied — you don't need to write `T: Copy + Clone`, just `T: Copy`.

### Deriving

```rust
#[derive(Clone, Copy)]
struct Number {
    odd: bool,
    value: i32,
}

// this expands to `impl Clone for Number` and `impl Copy for Number` blocks.
```
### `Copy` vs `Clone`

Both duplicate a value, but they differ in cost and intent:

|          | `Copy`                       | `Clone`                            |
| -------- | ---------------------------- | ---------------------------------- |
| How      | Implicit bitwise copy        | Explicit `.clone()` call           |
| Cost     | Always cheap (stack only)    | Can be expensive (heap allocation) |
| When     | Automatic on assignment/pass | Only when you call `.clone()`      |
| Requires | `Clone` (Copy implies Clone) | Nothing                            |

- **`Copy`** types are duplicated silently — integers, booleans, `char`, `f64`, references `&T`
- **`Clone`** types require an explicit call — `String`, `Vec<T>`, `HashMap` etc.
- A type can be `Clone` without being `Copy` (e.g. `String`)
- A type cannot be `Copy` if it contains non-`Copy` fields

```rust
// Copy - implicit, no .clone() needed
let x: i32 = 5;
let y = x;       // x is copied, both x and y are valid

// Clone - explicit
let s = String::from("hello");
let t = s.clone(); // explicit deep copy; s is still valid
```

You cannot implement `Copy` on a type that manages heap memory (like `String`), because the compiler relies on `Copy` meaning "a simple memcpy is sufficient".

#### Why `Copy` requires `Clone`

`Copy` is a subtrait of `Clone` (`Copy: Clone`), so every `Copy` type must also implement `Clone`. This is a deliberate design choice:

- `Clone` is the general "I can duplicate myself" contract
- `Copy` is a stronger promise: "I can be duplicated trivially (bitwise)"
- Making `Copy` a subtrait enforces that relationship — a `Copy` type is just a `Clone` type where `.clone()` is guaranteed to be a no-op bitwise copy

This means generic code that requires `Clone` will also accept `Copy` types, and you can always call `.clone()` on a `Copy` type (redundant but valid).

When you `#[derive(Copy, Clone)]`, the derived `Clone` impl just does `*self` — consistent with what `Copy` does implicitly.

### Marker Traits
- Have no method

### Default trait
The `Default` trait provides a way to create a default value for a type.

```rust

struct Greeting {
    greeting: String,
    whom: String,
}

impl Default for Greeting {
    fn default() -> Self {
        Self {
            greeting: "howdy".into(),
            whom: "partner".into(),
        }
    }
}
```

### External Trait Implementation Pattern

A common Rust pattern where you implement a trait defined by an external crate on your own types. This lets you plug into the crate's existing logic — you supply the "what" (your data/behavior), the crate supplies the "how" (the complex logic). The trait is the bridge between the two.

#### The Pattern

An external crate defines:
1. A trait (the contract)
2. Functions/methods with that trait as a bound (the logic)

You implement the trait on your type, which unlocks all of the crate's logic for free.

#### Example: Encoding

```rust
// External crate provides:
// trait Encode { fn encode(&self, buf: &mut Vec<u8>); }
// fn send_message<T: Encode>(msg: &T) { ... complex networking logic ... }

struct MyMessage {
    id: u64,
    body: String,
}

impl external_crate::Encode for MyMessage {
    fn encode(&self, buf: &mut Vec<u8>) {
        buf.extend(&self.id.to_le_bytes());
        buf.extend(self.body.as_bytes());
    }
}

// Now you get all the crate's logic for free:
external_crate::send_message(&my_msg);
```

You only write the thin "how to encode my type" part. The crate does the heavy lifting (networking, framing, retries, etc.).

#### Example: Serde

Implementing `Serialize` (usually via derive) unlocks the entire serde ecosystem:

```rust
#[derive(Serialize, Deserialize)]
struct MyConfig {
    name: String,
    version: u32,
}

// Serialize was implemented via derive, now you get:
serde_json::to_string(&config)?;    // JSON serialization
toml::to_string(&config)?;          // TOML serialization
bincode::serialize(&config)?;       // binary serialization
```

#### Example: Error Conversion

Implementing `From` lets you use `?` to propagate external errors into your own error type:

```rust
struct MyError(String);

impl From<some_crate::SomeError> for MyError {
    fn from(err: some_crate::SomeError) -> Self {
        MyError(err.to_string())
    }
}

fn do_work() -> Result<(), MyError> {
    some_crate::risky_operation()?; // SomeError auto-converts to MyError
    Ok(())
}
```

#### Example: Framework Callbacks

Some crates define handler/callback traits. Implementing them plugs your logic into the framework's lifecycle:

```rust
// External crate defines:
// trait EventHandler { fn on_event(&self, event: Event); }
// fn run_server<H: EventHandler>(handler: H) { ... }

struct MyHandler;

impl some_crate::EventHandler for MyHandler {
    fn on_event(&self, event: Event) {
        println!("got event: {:?}", event);
    }
}

some_crate::run_server(MyHandler);
```

## `#[non_exhaustive]`

Prevents external crates from constructing or exhaustively matching a struct or enum. Lets you add fields or variants in a future version without it being a breaking change.

**On an enum** — external code must include a `_` wildcard arm:

```rust
#[non_exhaustive]
pub enum Command {
    Status,
    Seed { .. },
}

// external crate — `_` arm required, or it won't compile
match cmd {
    Command::Status => { ... }
    Command::Seed { .. } => { ... }
    _ => { }
}
```

**On a struct** — external code must use `..` in patterns and cannot construct the struct directly (since it can't know all fields):

```rust
#[non_exhaustive]
pub struct Config {
    pub timeout: u32,
}

// external crate — must use `..` to ignore any future fields
let Config { timeout, .. } = config;

// construction is forbidden outside the defining crate
let c = Config { timeout: 30 }; // compile error
```

Both constraints apply simultaneously if you have a non-exhaustive enum with non-exhaustive struct variants.

## Generics
```rust
use std::fmt::Debug;

// Type parameters usually have _constraints_, so you can actually do something with them.
fn compare<T>(left: T, right: T)
where
    T: Debug + PartialEq,
{
    println!("{:?} {} {:?}", left, if left == right { "==" } else { "!=" }, right);
}

fn main() {
    compare("tea", "coffee");
    // prints: "tea" != "coffee"
}
```

## Vectors
- ~ Heap allocated array
```rust
let mut v1 = Vec::new(); 
v1.push(1);

// or 

let mut v1 = vec![1, 2, 3];
v1.push(4);
```

### Iterating over Vectors

```rust
let v = vec![1, 2, 3];

// iter() - borrows, yields &T
for x in v.iter() { }    // x: &i32, v still usable

// iter_mut() - mutably borrows, yields &mut T
for x in v.iter_mut() { *x += 1; }

// into_iter() - takes ownership, yields T
for x in v.into_iter() { }  // x: i32, v is consumed
// v no longer usable here

// iter().copied() - borrows but yields owned copies (for Copy types)
for x in v.iter().copied() { }  // x: i32, v still usable
```

## Macros
- All of `name!()`, `name![]` or `name!{}` invoke a macro. 
- Macros just expand to regular code.
## Lifetimes

The lifetime of a reference cannot exceed the lifetime of the variable binding it borrows.

## Owned types vs reference types
For many types in Rust, there are owned and non-owned variants:

- **Strings**: `String` is owned, `&str` is a reference.
- **Paths**: `PathBuf` is owned, `&Path` is a reference.
- **Collections**: `Vec<T>` is owned, `&[T]` is a reference.

## Error Handling

Rust uses `Result<T, E>` for recoverable errors and `panic!` for unrecoverable errors.

```rust
use std::fs::File;

fn main() {
    // Returns Result<File, std::io::Error>
    let file = File::open("hello.txt");

    let file = match file {
        Ok(f) => f,
        Err(e) => panic!("Problem opening the file: {:?}", e),
    };
}
```

### The `?` operator

Propagates errors up to the calling function:

```rust
fn read_username() -> Result<String, std::io::Error> {
    let mut s = String::new();
    File::open("hello.txt")?.read_to_string(&mut s)?;
    Ok(s)
}
```

### Swallowing errors

Instead of propagating with `?`, use `if let Err` to log and continue:

```rust
// Try to delete a cache file, but don't fail if it doesn't exist
if let Err(e) = std::fs::remove_file("cache.tmp") {
    eprintln!("Could not remove cache: {e}");
}
// Program continues regardless
```

Or with `unwrap_or_else`:

```rust
std::fs::remove_file("cache.tmp")
    .unwrap_or_else(|e| eprintln!("Could not remove cache: {e}"));
```

Both approaches swallow the error so the program continues running. The `if let` version is more idiomatic when you don't need the success value (or it's `()`).

### Custom Error Types

Define your own error type by implementing `std::error::Error`:

```rust
#[derive(Debug)]
struct MyError {
    message: String,
}

impl std::fmt::Display for MyError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for MyError {}
```

### The `thiserror` crate

`thiserror` reduces boilerplate when defining custom error types. It derives `Display` and `Error` implementations automatically.

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DataError {
    #[error("failed to read file: {0}")]
    IoError(#[from] std::io::Error),

    #[error("invalid data format at line {line}")]
    ParseError { line: usize },

    #[error("missing required field: {0}")]
    MissingField(String),
}
```

Key features:
- `#[error("...")]` - generates the `Display` impl with the message
- `#[from]` - generates a `From` impl for automatic conversion (enables `?` to convert errors)
- `#[source]` - marks a field as the underlying cause (for error chaining)
- `#[error(transparent)]` - forwards the `Display` and `source()` of the wrapped error directly
- Supports named fields, tuple variants, and unit variants

`#[error(transparent)]` is useful when you want your error to act as a thin wrapper:

```rust
#[derive(Error, Debug)]
pub enum MyError {
    #[error("database error: {0}")]
    Database(#[from] DbError),  // adds context with custom message

    #[error(transparent)]
    Other(#[from] anyhow::Error),  // passes through as-is, no extra message
}
```

With `transparent`, calling `.to_string()` or `source()` on `MyError::Other` returns exactly what the inner `anyhow::Error` would return.

Using the error:

```rust
fn process_file(path: &str) -> Result<Data, DataError> {
    let contents = std::fs::read_to_string(path)?; // IoError auto-converted via #[from]

    if contents.is_empty() {
        return Err(DataError::MissingField("content".to_string()));
    }

    // ...
    Ok(data)
}
```

`thiserror` is best for **library** code where you want typed, structured errors. For **application** code, consider `anyhow` which provides simpler ad-hoc error handling.

### Serializing errors for Tauri

Tauri commands return results to the frontend as JSON. If your command returns a `Result<T, E>`, the error type `E` must implement `serde::Serialize`:

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
pub enum CommandError {
    #[error("file not found: {0}")]
    NotFound(String),

    #[error("permission denied")]
    PermissionDenied,
}

#[tauri::command]
fn read_config() -> Result<Config, CommandError> {
    // ...
}
```

For errors that wrap types which don't implement `Serialize` (like `std::io::Error`), convert them to a string:

```rust
#[derive(Error, Debug, Serialize)]
pub enum CommandError {
    #[error("{0}")]
    Io(String),
}

impl From<std::io::Error> for CommandError {
    fn from(err: std::io::Error) -> Self {
        CommandError::Io(err.to_string())
    }
}
```

Now `?` will automatically convert `std::io::Error` into your serializable `CommandError`.
