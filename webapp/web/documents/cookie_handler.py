from typing import List  # Python 3.8 and earlier
from faker import Faker
import asdf

def greet_all(names: List[str]) -> None:
    fake = Faker('it_IT')
    for name in names:
        print('Hello ' + name)


names = ["Alice", "Bob", "Charlie"]
ages = [20, 30, 40]

greet_all(names)   # Ok!
# greet_all(ages)    # Error due to incompatible types


def stars(*args: int, **kwargs: float) -> None:
    # 'args' has type 'tuple[int, ...]' (a tuple of ints)
    # 'kwargs' has type 'dict[str, float]' (a dict of strs to floats)
    for arg in args:
        print(arg)
    for key, value in kwargs:
        print(key, value)
