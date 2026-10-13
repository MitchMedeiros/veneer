extends CharacterBody2D
class_name Player

# movement
signal died(reason)

@export var speed: float = 200.0
@onready var sprite: Sprite2D = $Sprite2D
var health := 100

func _physics_process(delta: float) -> void:
	var dir := Input.get_vector("left", "right", "up", "down")
	velocity = dir * speed
	move_and_slide()
	if health <= 0:
		emit_signal("died", "no health")

func hit(amount: int) -> void:
	health -= amount
	print("hit for %d" % amount)
	for i in range(3):
		await get_tree().create_timer(0.1).timeout
