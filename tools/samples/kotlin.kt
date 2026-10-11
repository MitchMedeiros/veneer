package com.example

import kotlinx.coroutines.*

/** Doc comment */
@Serializable
data class User(val name: String, var age: Int = 0, val tags: List<String>? = null)

sealed interface Result<out T> {
    data class Ok<T>(val value: T) : Result<T>
    object Fail : Result<Nothing>
}

// line comment
suspend fun load(id: Long, vararg extra: String): Result<User> = coroutineScope {
    val text = """
        raw $id and ${id + 1}
    """.trimIndent()
    val s = "plain $id ${text.length} \n"
    val n = 0xFF + 1_000L + 3.5f
    when (id) {
        1L -> Result.Ok(User("a"))
        in 2..10 -> Result.Fail
        else -> throw IllegalArgumentException("no")
    }
}

fun <T : Comparable<T>> List<T>.maxOrNull(): T? = if (isEmpty()) null else reduce { a, b -> if (a > b) a else b }

class Box<T>(private val item: T) {
    companion object { const val ID = "box" }
    val lazyValue: String by lazy { "x" }
    infix fun and(other: Box<T>) = this
}
