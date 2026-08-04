-- Comment is a non-hideable field; remove any legacy hidden state.
DELETE FROM user_column_visibility WHERE canonical_field_name = 'Comment';
