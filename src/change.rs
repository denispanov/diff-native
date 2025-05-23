use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Change {
    pub value: String,
    pub added: bool,
    pub removed: bool,
    pub count: u32,
}
