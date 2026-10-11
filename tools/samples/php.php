<?php

declare(strict_types=1);

namespace App\Models;

use InvalidArgumentException as IAE;

/**
 * Doc comment.
 * @property string $name
 */
#[Attribute]
final class User extends Model implements \JsonSerializable
{
    public const ROLE = 'admin';
    private ?string $name = null;
    protected static int $count = 0;

    // line comment
    public function __construct(private readonly string $email, int ...$ids)
    {
        $this->name = "Name: {$email} and $ids[0] and ${email}";
    }

    public function greet(string $who = "world"): string
    {
        $text = <<<EOT
        Hello $who {$this->name}
        EOT;
        $raw = <<<'RAW'
        no $interp
        RAW;
        $arr = ['a' => 1, "b" => [1.5, 0x1F, 1_000]];
        foreach ($arr as $k => $v) {
            if ($v instanceof self || is_null($v)) { continue; }
        }
        return match (true) { $who === 'x' => 'X', default => strtoupper($who) } . PHP_EOL;
    }
}

function helper(callable $fn): void { echo $fn(), "\n"; }
?>
<p><?= htmlspecialchars($title) ?></p>
