use serde_json::Value;

pub fn generate_options(options: Option<Value>, mut defaults: Value) -> Value {
    if let Some(Value::Object(map)) = options {
        if let Value::Object(def_map) = &mut defaults {
            for (k, v) in map {
                def_map.insert(k, v);
            }
        }
    }
    defaults
}
