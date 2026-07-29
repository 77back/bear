import pathlib
import sys

# 让测试能 import 同级模块（common/process/build_content/fetch）
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
